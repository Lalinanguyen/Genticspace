import logging
import re
import time

import anthropic
import httpx

from app.config import settings
from app.db.database import get_conn
from app.services.github_analysis import github_headers, github_rate_limit_wait

logger = logging.getLogger(__name__)

_TIMEOUT = 10.0
_MAX_README_CHARS_FOR_PROMPT = 8000

# Canonical industry taxonomy — shared with the Contribute page's tag list.
INDUSTRIES = [
    "Healthcare", "Customer Support", "Finance & Fintech", "Legal",
    "Retail & E-commerce", "Marketing", "Software Engineering", "Education",
    "HR & Recruiting", "Real Estate", "Manufacturing", "Travel & Hospitality",
    "Insurance", "Media & Entertainment", "Logistics & Supply Chain",
    "Agriculture", "Sports & Fitness",
]

_INDUSTRY_KEYWORDS: dict[str, set[str]] = {
    "Healthcare": {"healthcare", "medical", "health", "clinical", "biomedical", "healthtech"},
    "Customer Support": {"customer-support", "customer-service", "helpdesk", "support-bot", "chatbot"},
    "Finance & Fintech": {"finance", "fintech", "trading", "banking", "crypto-trading", "payments"},
    "Legal": {"legal", "law", "compliance", "contract-analysis", "legaltech"},
    "Retail & E-commerce": {"ecommerce", "e-commerce", "retail", "shopping", "commerce"},
    "Marketing": {"marketing", "seo", "advertising", "content-generation", "growth"},
    "Software Engineering": {
        "code", "coding", "code-generation", "developer-tools", "programming",
        "software-engineering", "devtools", "coding-agent",
    },
    "Education": {"education", "edtech", "tutoring", "learning", "e-learning"},
    "HR & Recruiting": {"hr", "recruiting", "recruitment", "hiring", "hrtech"},
    "Real Estate": {"real-estate", "realestate", "property", "proptech"},
    "Manufacturing": {"manufacturing", "industrial", "factory", "supply-chain-management"},
    "Travel & Hospitality": {"travel", "hospitality", "booking", "tourism"},
    "Insurance": {"insurance", "insurtech", "underwriting", "claims"},
    "Media & Entertainment": {"media", "entertainment", "gaming", "video", "music", "streaming"},
    "Logistics & Supply Chain": {"logistics", "supply-chain", "shipping", "fleet", "warehousing"},
    "Agriculture": {"agriculture", "agtech", "farming"},
    "Sports & Fitness": {"sports", "fitness", "health-tracking", "wellness"},
}

# Only SPDX-style keys that are genuinely open-source get mapped — anything
# ambiguous or custom (e.g. many model-specific HF licenses) is left NULL
# rather than guessed, per the registry's no-fabrication stance.
_OSS_LICENSE_KEYS = {
    "mit", "apache-2.0", "gpl-3.0", "gpl-2.0", "bsd-3-clause", "bsd-2-clause",
    "lgpl-3.0", "lgpl-2.1", "mpl-2.0", "unlicense", "cc0-1.0", "isc", "agpl-3.0",
    "epl-2.0", "artistic-2.0", "wtfpl", "0bsd", "bsl-1.0",
}

_DESC_SYSTEM_PROMPT = """You write short, factual one-sentence descriptions of AI agents/models for a trust registry marketplace, based only on the README text given to you. Never invent capabilities, integrations, or claims that aren't stated in the text. If the README is too sparse or generic to describe anything specific, write a brief, honest, generic sentence based on just the name and any real tags provided, do not pad with marketing language. Never use em dashes (—) anywhere in the response; use a comma or period instead. Respond with ONLY the one-sentence description, no preamble, no quotes."""


_EM_DASH_RE = re.compile(r"\s*—\s*")


def sanitize_text(text: str | None) -> str | None:
    """Strip em dashes from scraped/generated text (the UI shows none)."""
    if not text:
        return text
    cleaned = _EM_DASH_RE.sub(", ", text)
    return re.sub(r"\s+", " ", cleaned).strip()


def _infer_industry_tags(keywords: list[str]) -> list[str]:
    kw = {k.lower() for k in keywords}
    return [industry for industry, markers in _INDUSTRY_KEYWORDS.items() if kw & markers]


def _normalize_license(key: str | None) -> str | None:
    if not key:
        return None
    k = key.lower().strip()
    if k in _OSS_LICENSE_KEYS:
        return "Open Source"
    return None


async def _generate_description(name: str, readme_text: str, tags: list[str]) -> str | None:
    if not settings.ANTHROPIC_API_KEY:
        return None
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    user_content = (
        f"Name: {name}\n"
        f"Tags: {', '.join(tags[:20]) if tags else 'none'}\n\n"
        f"README:\n{readme_text[:_MAX_README_CHARS_FOR_PROMPT]}"
    )
    try:
        response = await client.messages.create(
            model="claude-opus-4-8",
            max_tokens=300,
            thinking={"type": "adaptive"},
            system=_DESC_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
        )
    except Exception as exc:
        logger.warning("Description generation failed for %r: %s", name, exc)
        return None

    if response.stop_reason == "refusal":
        return None
    text = next((b.text for b in response.content if b.type == "text"), "")
    return sanitize_text(text.strip().strip('"')) or None


# ---------------------------------------------------------------------------
# Connects — for sources where the "connect" link is unambiguous (a GitHub
# repo's own web_endpoint IS its GitHub URL; same for Hugging Face), just
# mirror the field. Real, already-known data — no external calls, no guessing.
# ---------------------------------------------------------------------------
async def backfill_connects() -> None:
    async with get_conn() as conn:
        gh = await conn.execute(
            """
            UPDATE agents SET github_url = web_endpoint
            WHERE source = 'github' AND github_url IS NULL AND web_endpoint IS NOT NULL
            """
        )
        hf = await conn.execute(
            """
            UPDATE agents SET huggingface_url = web_endpoint
            WHERE source = 'huggingface' AND huggingface_url IS NULL AND web_endpoint IS NOT NULL
            """
        )
    logger.info("Connects backfill: github=%s huggingface=%s", gh, hf)


# ---------------------------------------------------------------------------
# ERC-8004 — no off-chain metadata exists for these at all today (the token
# either has no tokenURI or it doesn't resolve). Nothing to summarize, so this
# is a single deterministic, honest statement of fact rather than a generated
# guess — never fabricate what such an agent might do.
# ---------------------------------------------------------------------------
async def backfill_erc8004() -> None:
    async with get_conn() as conn:
        result = await conn.execute(
            """
            UPDATE agents
            SET description = 'On-chain agent identity registered via ERC-8004 (token #' || source_id || '). No off-chain profile has been published for this agent yet.'
            WHERE source = 'erc8004' AND (description IS NULL OR length(trim(description)) = 0)
            """
        )
    logger.info("ERC-8004 description backfill: %s", result)


# ---------------------------------------------------------------------------
# GitHub — repos are inherently self-hostable code, so deployment_types is a
# safe deterministic default. License and topics are real fields on the repo
# API that the original scraper discarded; this fetches them directly.
# ---------------------------------------------------------------------------
async def _get_github_backfill_batch(batch_size: int) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT genticspace_id, source_id, description FROM agents
            WHERE source = 'github' AND github_enriched_at IS NULL
            ORDER BY last_indexed ASC
            LIMIT $1
            """,
            batch_size,
        )
    return [dict(r) for r in rows]


async def backfill_github(batch_size: int | None = None) -> None:
    """Fetch real repo metadata (license, topics, owner avatar) for github
    agents that haven't been enriched yet. github_enriched_at is the sole
    "done" marker, set only once a real fetch succeeds (200) or definitively
    has nothing to fetch (404/451) — never on a rate-limited or network
    failure, so those agents get retried on the next pass instead of being
    silently skipped forever."""
    start = time.monotonic()
    batch = await _get_github_backfill_batch(batch_size or settings.GITHUB_ENRICH_BATCH_SIZE)
    if not batch:
        logger.info("GitHub enrichment: nothing to backfill")
        return

    updated = 0
    rate_limited = False
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=github_headers(), follow_redirects=True) as client:
        for agent in batch:
            try:
                resp = await client.get(f"https://api.github.com/repos/{agent['source_id']}")
            except Exception as exc:
                logger.debug("GitHub repo fetch failed for %s: %s", agent["source_id"], exc)
                continue  # transient — leave github_enriched_at NULL, retry later

            wait = github_rate_limit_wait(resp)
            if wait is not None:
                logger.info(
                    "GitHub rate limit exhausted (%.0fs until reset), stopping batch at %d/%d",
                    wait, updated, len(batch),
                )
                rate_limited = True
                break

            if resp.status_code not in (200, 404, 451):
                continue  # transient server error — leave NULL, retry later

            license_key = None
            topics: list[str] = []
            image_url = None
            description = agent["description"]
            if resp.status_code == 200:
                data = resp.json()
                license_key = (data.get("license") or {}).get("spdx_id")
                topics = data.get("topics") or []
                image_url = (data.get("owner") or {}).get("avatar_url")
                if not description:
                    description = (data.get("description") or "")[:2000] or None

            industry_tags = _infer_industry_tags(topics)
            license_name = _normalize_license(license_key)

            async with get_conn() as conn:
                await conn.execute(
                    """
                    UPDATE agents SET
                        description = COALESCE(description, $2),
                        license = COALESCE(license, $3),
                        industry_tags = CASE WHEN industry_tags IS NULL OR array_length(industry_tags, 1) IS NULL
                                             THEN $4 ELSE industry_tags END,
                        image_url = COALESCE(image_url, $5),
                        deployment_types = ARRAY['On-prem'],
                        github_enriched_at = NOW()
                    WHERE genticspace_id = $1
                    """,
                    agent["genticspace_id"], description, license_name, industry_tags or None, image_url,
                )
            updated += 1

    elapsed = time.monotonic() - start
    logger.info(
        "GitHub enrichment complete: %d/%d updated, %.1fs%s",
        updated, len(batch), elapsed, " [rate limited]" if rate_limited else "",
    )


# ---------------------------------------------------------------------------
# Hugging Face — cardData.license and tags are real, structured metadata.
# The README is real prose we can summarize (grounded); Claude is only used
# to condense that real text, never to invent a description from nothing.
# ---------------------------------------------------------------------------
async def _get_huggingface_backfill_batch(batch_size: int) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT genticspace_id, source_id, name, provider_org FROM agents
            WHERE source = 'huggingface' AND hf_enriched_at IS NULL
            ORDER BY last_indexed ASC
            LIMIT $1
            """,
            batch_size,
        )
    return [dict(r) for r in rows]


def _hf_headers() -> dict:
    headers = {}
    if settings.HUGGINGFACE_TOKEN:
        headers["Authorization"] = f"Bearer {settings.HUGGINGFACE_TOKEN}"
    return headers


async def backfill_huggingface(batch_size: int | None = None) -> None:
    start = time.monotonic()
    batch = await _get_huggingface_backfill_batch(batch_size or settings.HF_ENRICH_BATCH_SIZE)
    if not batch:
        logger.info("Hugging Face enrichment: nothing to backfill")
        return

    updated = 0
    # Deliberately not fetching /api/users/{username}/avatar here — that's the
    # author's personal HF profile picture, not an icon for the model/space
    # itself. Leave image_url unset; the UI falls back to a generic icon.
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_hf_headers(), follow_redirects=True) as client:
        for agent in batch:
            kind, _, repo_id = agent["source_id"].partition(":")
            if not repo_id:
                continue

            try:
                detail_resp = await client.get(
                    f"https://huggingface.co/api/{kind}/{repo_id}", params={"full": "true"}
                )
            except Exception as exc:
                logger.debug("HF detail fetch failed for %s: %s", repo_id, exc)
                continue  # transient — leave hf_enriched_at NULL, retry later

            if detail_resp.status_code == 429:
                logger.info("Hugging Face rate limited, stopping batch at %d/%d", updated, len(batch))
                break
            # 401/403: gated or access-restricted repo we can't read without
            # credentials — nothing more to learn without a token, so mark
            # it done rather than retrying forever. 404: repo gone, same.
            if detail_resp.status_code not in (200, 401, 403, 404):
                continue  # transient server error — leave NULL, retry later

            detail = detail_resp.json() if detail_resp.status_code == 200 else {}

            card = detail.get("cardData") or {}
            tags = detail.get("tags") or []
            license_key = (card.get("license") if isinstance(card, dict) else None) or next(
                (t.split(":", 1)[1] for t in tags if t.startswith("license:")), None
            )

            readme_prefix = "spaces/" if kind == "spaces" else ""
            readme_text = None
            try:
                readme_resp = await client.get(
                    f"https://huggingface.co/{readme_prefix}{repo_id}/raw/main/README.md",
                    follow_redirects=True,
                )
                if readme_resp.status_code == 200 and readme_resp.text.strip():
                    readme_text = readme_resp.text[:20000]
            except Exception as exc:
                logger.debug("HF README fetch failed for %s: %s", repo_id, exc)

            description = None
            if readme_text and len(readme_text) > 60:
                description = await _generate_description(agent["name"] or repo_id, readme_text, tags)
            if not description:
                pipeline = detail.get("pipeline_tag") or detail.get("library_name")
                if pipeline:
                    description = f"A {pipeline} {kind[:-1] if kind == 'models' else 'space'} published by {agent['provider_org'] or 'its author'} on Hugging Face."
                else:
                    description = f"A Hugging Face {kind[:-1] if kind == 'models' else 'space'} published by {agent['provider_org'] or 'its author'}."

            industry_tags = _infer_industry_tags(tags)
            license_name = _normalize_license(license_key)

            async with get_conn() as conn:
                await conn.execute(
                    """
                    UPDATE agents SET
                        description = COALESCE(NULLIF(trim(description), ''), $2),
                        license = COALESCE(license, $3),
                        industry_tags = CASE WHEN industry_tags IS NULL OR array_length(industry_tags, 1) IS NULL
                                             THEN $4 ELSE industry_tags END,
                        deployment_types = ARRAY['Cloud'],
                        readme_text = COALESCE($5, readme_text),
                        readme_fetched_at = CASE WHEN $5 IS NOT NULL THEN NOW() ELSE readme_fetched_at END,
                        hf_enriched_at = NOW()
                    WHERE genticspace_id = $1
                    """,
                    agent["genticspace_id"], description, license_name, industry_tags or None, readme_text,
                )
            updated += 1

    elapsed = time.monotonic() - start
    logger.info("Hugging Face enrichment complete: %d/%d updated, %.1fs", updated, len(batch), elapsed)
