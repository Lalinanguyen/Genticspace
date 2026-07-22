import asyncio
import logging
import secrets
import time

import httpx

from app.config import settings
from app.db.database import get_conn

logger = logging.getLogger(__name__)

_API_BASE = "https://huggingface.co/api"
_TIMEOUT = 10.0
_MAX_RETRIES = 3

# Search terms and tags used to find agent-relevant repos. HF has no strict
# "agent" repo type, so we combine free-text search with known agent-framework
# and protocol tags (mcp-server/a2a are real tags builders use on the Hub).
_SEARCH_TERMS = [
    "agent", "autonomous agent", "ai agent", "multi-agent", "agentic",
    "tool use agent", "coding agent", "chat agent", "voice agent",
    "customer support agent", "browser agent", "research agent", "assistant agent",
]
_TAGS = [
    "agent", "agents", "agentic", "ai-agent", "autonomous-agents", "multi-agent",
    "tool-use", "function-calling", "tool-calling",
    "mcp-server", "mcp-client", "mcp", "model-context-protocol",
    "a2a", "agent2agent", "agent-protocol",
    "smolagents", "autogen", "crewai", "langgraph", "pydantic-ai", "browser-use",
]

_MCP_MARKERS = {"mcp-server", "mcp-client", "mcp", "model-context-protocol"}
_A2A_MARKERS = {"a2a", "agent2agent", "agent-protocol"}
_X402_MARKERS = {"x402"}


def _hf_genticspace_id() -> str:
    return "hf_" + secrets.token_urlsafe(8)


def _headers() -> dict:
    headers = {}
    if settings.HUGGINGFACE_TOKEN:
        headers["Authorization"] = f"Bearer {settings.HUGGINGFACE_TOKEN}"
    return headers


async def _get_with_retry(client: httpx.AsyncClient, url: str, **kwargs) -> httpx.Response | None:
    delay = 1.0
    for attempt in range(_MAX_RETRIES):
        try:
            resp = await client.get(url, **kwargs)
        except Exception as exc:
            logger.debug("GET %s failed: %s", url, exc)
            return None
        if resp.status_code != 429:
            return resp
        wait = float(resp.headers.get("retry-after", delay))
        logger.debug("Rate limited on %s, backing off %.1fs (attempt %d/%d)", url, wait, attempt + 1, _MAX_RETRIES)
        await asyncio.sleep(wait)
        delay *= 2
    return None


async def _search(client: httpx.AsyncClient, kind: str, *, search: str | None = None, tag: str | None = None) -> list[dict]:
    params = {"limit": settings.HF_SCRAPE_MAX_PER_QUERY, "sort": "likes", "direction": -1}
    if search:
        params["search"] = search
    if tag:
        params["filter"] = tag
    resp = await _get_with_retry(client, f"{_API_BASE}/{kind}", params=params)
    if resp is None or resp.status_code != 200:
        return []
    try:
        data = resp.json()
        return data if isinstance(data, list) else []
    except Exception:
        return []


async def _fetch_detail(client: httpx.AsyncClient, kind: str, repo_id: str) -> dict | None:
    resp = await _get_with_retry(client, f"{_API_BASE}/{kind}/{repo_id}", params={"full": "true"})
    if resp is None or resp.status_code != 200:
        return None
    try:
        return resp.json()
    except Exception:
        return None


def _extract_description(detail: dict) -> str | None:
    card = detail.get("cardData") or {}
    if isinstance(card, dict):
        summary = card.get("summary") or card.get("description")
        if summary:
            return str(summary)[:2000]
    return None


def _protocol_flags(tags: list[str]) -> tuple[bool, bool, bool]:
    tagset = {t.lower() for t in tags}
    return (
        bool(tagset & _MCP_MARKERS),
        bool(tagset & _A2A_MARKERS),
        bool(tagset & _X402_MARKERS),
    )


async def _upsert_repo(kind: str, repo_id: str, detail: dict) -> str:
    source_id = f"{kind}:{repo_id}"
    author = repo_id.split("/")[0] if "/" in repo_id else repo_id
    name = repo_id.split("/")[-1]
    tags = detail.get("tags") or []
    is_mcp, is_a2a, has_x402 = _protocol_flags(tags)

    web_endpoint = (
        f"https://huggingface.co/spaces/{repo_id}" if kind == "spaces" else f"https://huggingface.co/{repo_id}"
    )
    description = _extract_description(detail)
    is_active = not detail.get("private", False)
    metadata_uri = f"{_API_BASE}/{kind}/{repo_id}?full=true"

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT genticspace_id FROM agents WHERE source = 'huggingface' AND source_id = $1",
            source_id,
        )
        genticspace_id = existing["genticspace_id"] if existing else _hf_genticspace_id()

        await conn.execute(
            """
            INSERT INTO agents (
                genticspace_id, source, source_id,
                name, description, metadata_uri,
                is_active, x402_support,
                a2a_endpoint, mcp_endpoint, web_endpoint,
                provider_org, provider_url,
                last_indexed
            ) VALUES (
                $1, 'huggingface', $2,
                $3, $4, $5,
                $6, $7,
                $8, $9, $10,
                $11, $12,
                NOW()
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                name         = EXCLUDED.name,
                -- Never clobber an enriched description with NULL: most HF
                -- repos have no cardData summary, and the backfill's
                -- Claude-generated descriptions live in this same column.
                description  = COALESCE(NULLIF(trim(EXCLUDED.description), ''), agents.description),
                metadata_uri = EXCLUDED.metadata_uri,
                is_active    = EXCLUDED.is_active,
                x402_support = EXCLUDED.x402_support,
                a2a_endpoint = EXCLUDED.a2a_endpoint,
                mcp_endpoint = EXCLUDED.mcp_endpoint,
                web_endpoint = EXCLUDED.web_endpoint,
                provider_org = EXCLUDED.provider_org,
                provider_url = EXCLUDED.provider_url,
                last_indexed = NOW()
            """,
            genticspace_id, source_id,
            name, description, metadata_uri,
            is_active, has_x402,
            web_endpoint if is_a2a else None,
            web_endpoint if is_mcp else None,
            web_endpoint,
            author, f"https://huggingface.co/{author}",
        )

    return genticspace_id


async def _process_candidate(client: httpx.AsyncClient, sem: asyncio.Semaphore, kind: str, repo_id: str) -> bool:
    async with sem:
        detail = await _fetch_detail(client, kind, repo_id)
        if detail is None:
            return False
        try:
            genticspace_id = await _upsert_repo(kind, repo_id, detail)
        except Exception as exc:
            logger.warning("Failed to upsert HF %s %s: %s", kind, repo_id, exc)
            return False

    from app.services.verifier import run_auto_verification
    try:
        await run_auto_verification(genticspace_id)
    except Exception as exc:
        logger.debug("Verification failed for %s: %s", genticspace_id, exc)
    return True


async def scrape_huggingface() -> None:
    """Discover and index agent-relevant Hugging Face models/Spaces."""
    start = time.monotonic()
    logger.info("Hugging Face scrape started")

    likes: dict[tuple[str, str], int] = {}

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_headers()) as client:
        for kind in ("models", "spaces"):
            for term in _SEARCH_TERMS:
                for item in await _search(client, kind, search=term):
                    if item.get("id"):
                        likes[(kind, item["id"])] = max(likes.get((kind, item["id"]), 0), item.get("likes", 0))
            for tag in _TAGS:
                for item in await _search(client, kind, tag=tag):
                    if item.get("id"):
                        likes[(kind, item["id"])] = max(likes.get((kind, item["id"]), 0), item.get("likes", 0))

        model_count = sum(1 for k in likes if k[0] == "models")
        space_count = sum(1 for k in likes if k[0] == "spaces")
        logger.info(
            "Hugging Face discovery found %d model candidates, %d space candidates",
            model_count, space_count,
        )

        ranked = sorted(likes.items(), key=lambda kv: kv[1], reverse=True)
        selected = ranked[: settings.HF_SCRAPE_MAX_CANDIDATES]
        logger.info(
            "Processing top %d of %d candidates by likes (HF_SCRAPE_MAX_CANDIDATES)",
            len(selected), len(ranked),
        )

        sem = asyncio.Semaphore(settings.HF_SCRAPE_CONCURRENCY)
        tasks = [
            _process_candidate(client, sem, kind, repo_id)
            for (kind, repo_id), _ in selected
        ]
        results = await asyncio.gather(*tasks)
        total = sum(1 for r in results if r)

    elapsed = time.monotonic() - start
    logger.info(
        "Hugging Face scrape complete: %d candidates found, %d processed, %d upserted, %.1fs",
        len(ranked), len(selected), total, elapsed,
    )
