import logging
import secrets
import time

import httpx

from app.db.database import get_conn
from app.services.description_backfill import _infer_industry_tags, sanitize_text

logger = logging.getLogger(__name__)

# Public, daily-updated mirror of Y Combinator's company directory
# (github.com/yc-oss/api). One JSON fetch covers the whole directory — no
# per-company page scraping needed, so this is the lightest-footprint way
# to read YC's data.
_DIRECTORY_URL = "https://yc-oss.github.io/api/companies/all.json"
_TIMEOUT = 30.0

# This is an AI agent registry, so only AI-relevant YC companies are listed.
_AI_TAG_MARKERS = {
    "ai", "artificial intelligence", "generative ai", "ai assistant",
    "machine learning", "conversational ai", "aiops", "ml",
}
# Inactive companies would be misleading listings; Acquired ones often no
# longer operate the original product, so keep only live businesses.
_KEEP_STATUSES = {"Active", "Public"}


def _yc_genticspace_id() -> str:
    return "yc_" + secrets.token_urlsafe(8)


def _is_ai_company(company: dict) -> bool:
    tags = [t.lower() for t in (company.get("tags") or [])]
    if any(t in _AI_TAG_MARKERS for t in tags):
        return True
    return (company.get("industry") or "").lower() == "artificial intelligence"


def _pick_description(company: dict) -> str | None:
    one_liner = (company.get("one_liner") or "").strip()
    if one_liner:
        return sanitize_text(one_liner[:2000])
    long_desc = (company.get("long_description") or "").strip()
    if long_desc:
        return sanitize_text(long_desc[:2000])
    return None


def _pick_logo(company: dict) -> str | None:
    logo = company.get("small_logo_thumb_url") or ""
    # Companies without a logo get a relative placeholder path; only absolute
    # URLs are real images.
    return logo if logo.startswith("http") else None


async def _upsert_company(company: dict) -> str | None:
    source_id = company.get("slug") or str(company.get("id") or "")
    name = (company.get("name") or "").strip()
    if not source_id or not name:
        return None

    description = _pick_description(company)
    website = company.get("website") or None
    yc_url = company.get("url") or f"https://www.ycombinator.com/companies/{source_id}"
    normalized_tags = [t.lower().replace(" ", "-") for t in (company.get("tags") or [])]
    industry_tags = _infer_industry_tags(normalized_tags) or None
    image_url = _pick_logo(company)

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT genticspace_id FROM agents WHERE source = 'ycombinator' AND source_id = $1",
            source_id,
        )
        genticspace_id = existing["genticspace_id"] if existing else _yc_genticspace_id()

        await conn.execute(
            """
            INSERT INTO agents (
                genticspace_id, source, source_id,
                name, description, web_endpoint, provider_org, provider_url, image_url,
                industry_tags,
                is_active, last_indexed
            ) VALUES (
                $1, 'ycombinator', $2,
                $3, $4, $5, $6, $7, $8,
                $9,
                TRUE, NOW()
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                name          = EXCLUDED.name,
                description   = COALESCE(NULLIF(trim(EXCLUDED.description), ''), agents.description),
                web_endpoint  = EXCLUDED.web_endpoint,
                provider_org  = EXCLUDED.provider_org,
                provider_url  = EXCLUDED.provider_url,
                image_url     = COALESCE(EXCLUDED.image_url, agents.image_url),
                industry_tags = CASE WHEN agents.industry_tags IS NULL THEN EXCLUDED.industry_tags ELSE agents.industry_tags END,
                last_indexed  = NOW()
            """,
            genticspace_id, source_id,
            name, description, website, name, yc_url, image_url,
            industry_tags,
        )

    return genticspace_id


async def scrape_ycombinator() -> None:
    """Index AI-relevant Y Combinator companies as agent listings.

    provider_org is set to the company name, which is what powers the
    /company/ycombinator/{name} public company profile pages — no separate
    profile records needed.
    """
    start = time.monotonic()
    logger.info("Y Combinator scrape started")

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        try:
            resp = await client.get(_DIRECTORY_URL)
        except Exception as exc:
            logger.warning("YC directory fetch failed: %s", exc)
            return
        if resp.status_code != 200:
            logger.warning("YC directory fetch returned %s", resp.status_code)
            return
        try:
            companies = resp.json()
        except Exception:
            logger.warning("YC directory response was not valid JSON")
            return

    candidates = [
        c for c in companies
        if c.get("status") in _KEEP_STATUSES and _is_ai_company(c)
    ]
    logger.info(
        "YC directory has %d companies, %d AI-relevant and active",
        len(companies), len(candidates),
    )

    from app.services.verifier import run_auto_verification

    upserted = 0
    for company in candidates:
        try:
            genticspace_id = await _upsert_company(company)
        except Exception as exc:
            logger.warning("Failed to upsert YC company %s: %s", company.get("slug"), exc)
            continue
        if not genticspace_id:
            continue
        upserted += 1
        # Confirms the company is still actually up and running (not just
        # "Active" per YC's own status field) by pinging its real endpoints,
        # and fills in trust_tier / verified / safe_to_transact accordingly —
        # the same auto-verification pass every other scraper runs.
        try:
            await run_auto_verification(genticspace_id)
        except Exception as exc:
            logger.debug("Verification failed for %s: %s", genticspace_id, exc)

    elapsed = time.monotonic() - start
    logger.info(
        "Y Combinator scrape complete: %d candidates, %d upserted, %.1fs",
        len(candidates), upserted, elapsed,
    )
