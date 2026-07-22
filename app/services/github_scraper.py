import asyncio
import logging
import secrets
import time
from datetime import datetime, timezone

import httpx

from app.config import settings
from app.db.database import get_conn
from app.services.description_backfill import sanitize_text

logger = logging.getLogger(__name__)

_API_BASE = "https://api.github.com"
_TIMEOUT = 10.0
_MAX_RETRIES = 3

# GitHub's search API has a much stricter rate limit (10/min unauthenticated,
# 30/min with a token) than the general REST API, so query breadth here is
# deliberately smaller than the Hugging Face scraper's.
_TOPIC_QUERIES = [
    "ai-agent", "agent", "agents", "agentic", "autonomous-agents", "multi-agent",
    "llm-agent", "llm-agents", "tool-use", "function-calling",
    "mcp-server", "mcp", "model-context-protocol",
    "a2a", "agent2agent",
    "smolagents", "autogen", "crewai", "langgraph",
]
_TEXT_QUERIES = [
    '"ai agent" in:name,description',
    '"autonomous agent" in:description',
]

_MCP_MARKERS = {"mcp-server", "mcp-client", "mcp", "model-context-protocol"}
_A2A_MARKERS = {"a2a", "agent2agent", "agent-protocol"}
_X402_MARKERS = {"x402"}


def _github_genticspace_id() -> str:
    return "gh_" + secrets.token_urlsafe(8)


def _headers() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


async def _wait_for_rate_limit(resp: httpx.Response) -> None:
    remaining = resp.headers.get("x-ratelimit-remaining")
    reset = resp.headers.get("x-ratelimit-reset")
    if remaining is not None and reset is not None and int(remaining) <= 1:
        wait = max(0.0, int(reset) - datetime.now(timezone.utc).timestamp()) + 1
        if wait > 0:
            logger.debug("Search rate limit nearly exhausted, waiting %.1fs", wait)
            await asyncio.sleep(wait)


async def _search_with_retry(client: httpx.AsyncClient, query: str) -> list[dict]:
    for attempt in range(_MAX_RETRIES):
        try:
            resp = await client.get(
                f"{_API_BASE}/search/repositories",
                params={"q": query, "sort": "stars", "order": "desc", "per_page": 100},
            )
        except Exception as exc:
            logger.debug("GitHub search failed for %r: %s", query, exc)
            return []

        if resp.status_code == 200:
            await _wait_for_rate_limit(resp)
            try:
                return resp.json().get("items", [])
            except Exception:
                return []

        if resp.status_code in (403, 429):
            reset = resp.headers.get("x-ratelimit-reset")
            retry_after = resp.headers.get("retry-after")
            if retry_after:
                wait = float(retry_after)
            elif reset:
                wait = max(1.0, int(reset) - datetime.now(timezone.utc).timestamp() + 1)
            else:
                wait = 5.0 * (attempt + 1)
            logger.debug("Rate limited on search %r, waiting %.1fs (attempt %d/%d)", query, wait, attempt + 1, _MAX_RETRIES)
            await asyncio.sleep(wait)
            continue

        logger.debug("GitHub search %r returned %d", query, resp.status_code)
        return []

    return []


def _protocol_flags(topics: list[str]) -> tuple[bool, bool, bool]:
    tagset = {t.lower() for t in topics}
    return (
        bool(tagset & _MCP_MARKERS),
        bool(tagset & _A2A_MARKERS),
        bool(tagset & _X402_MARKERS),
    )


async def _upsert_repo(item: dict) -> str:
    full_name = item["full_name"]
    source_id = full_name
    owner = item.get("owner") or {}
    topics = item.get("topics") or []
    is_mcp, is_a2a, has_x402 = _protocol_flags(topics)

    web_endpoint = item.get("html_url")
    description = sanitize_text((item.get("description") or "")[:2000]) or None
    is_active = not item.get("archived", False) and not item.get("disabled", False)
    metadata_uri = item.get("url")
    # Deliberately NOT using owner.get("avatar_url") here — that's the repo
    # owner's personal GitHub profile picture, not an icon for the agent/tool
    # itself. Leave image_url unset; the UI falls back to a generic icon.
    provider_org = owner.get("login")
    provider_url = owner.get("html_url")

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT genticspace_id FROM agents WHERE source = 'github' AND source_id = $1",
            source_id,
        )
        genticspace_id = existing["genticspace_id"] if existing else _github_genticspace_id()

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
                $1, 'github', $2,
                $3, $4, $5,
                $6, $7,
                $8, $9, $10,
                $11, $12,
                NOW()
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                name         = EXCLUDED.name,
                -- Repos without a GitHub description would otherwise clobber
                -- a backfilled description with NULL on every re-scrape.
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
            item.get("name"), description, metadata_uri,
            is_active, has_x402,
            web_endpoint if is_a2a else None,
            web_endpoint if is_mcp else None,
            web_endpoint,
            provider_org, provider_url,
        )

    return genticspace_id


async def _verify_one(sem: asyncio.Semaphore, genticspace_id: str) -> None:
    from app.services.verifier import run_auto_verification
    async with sem:
        try:
            await run_auto_verification(genticspace_id)
        except Exception as exc:
            logger.debug("Verification failed for %s: %s", genticspace_id, exc)


async def scrape_github() -> None:
    """Discover and index agent-relevant GitHub repositories."""
    start = time.monotonic()
    logger.info("GitHub scrape started")

    candidates: dict[str, dict] = {}

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_headers()) as client:
        for topic in _TOPIC_QUERIES:
            for item in await _search_with_retry(client, f"topic:{topic}"):
                full_name = item.get("full_name")
                if full_name and full_name not in candidates:
                    candidates[full_name] = item
        for query in _TEXT_QUERIES:
            for item in await _search_with_retry(client, query):
                full_name = item.get("full_name")
                if full_name and full_name not in candidates:
                    candidates[full_name] = item

        logger.info("GitHub discovery found %d unique repo candidates", len(candidates))

        ranked = sorted(candidates.values(), key=lambda i: i.get("stargazers_count", 0), reverse=True)
        selected = ranked[: settings.GITHUB_SCRAPE_MAX_CANDIDATES]
        logger.info(
            "Processing top %d of %d candidates by stars (GITHUB_SCRAPE_MAX_CANDIDATES)",
            len(selected), len(ranked),
        )

        genticspace_ids = []
        for item in selected:
            try:
                genticspace_ids.append(await _upsert_repo(item))
            except Exception as exc:
                logger.warning("Failed to upsert GitHub repo %s: %s", item.get("full_name"), exc)

        sem = asyncio.Semaphore(settings.GITHUB_SCRAPE_CONCURRENCY)
        await asyncio.gather(*(_verify_one(sem, tid) for tid in genticspace_ids))

    elapsed = time.monotonic() - start
    logger.info(
        "GitHub scrape complete: %d candidates found, %d upserted, %.1fs",
        len(ranked), len(genticspace_ids), elapsed,
    )
