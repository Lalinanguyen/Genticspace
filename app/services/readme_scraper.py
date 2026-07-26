import asyncio
import base64
import logging
import time

import httpx

from app.config import settings
from app.db.database import get_conn
from app.services.github_analysis import github_headers, github_rate_limit_wait

logger = logging.getLogger(__name__)

_API_BASE = "https://api.github.com"
_TIMEOUT = 10.0
_MAX_README_CHARS = 20000
# See description_backfill._GITHUB_REQUEST_DELAY_SECONDS: GitHub's secondary
# rate limiter can 403 a fast sequential burst well before the primary
# x-ratelimit-remaining hits 0, which github_rate_limit_wait() can't detect.
_GITHUB_REQUEST_DELAY_SECONDS = 0.3


async def _get_stale_github_agents() -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT tracent_id, source_id FROM agents
            WHERE source = 'github'
              AND (readme_fetched_at IS NULL OR readme_fetched_at < NOW() - INTERVAL '1 day' * $1)
            ORDER BY readme_fetched_at ASC NULLS FIRST
            LIMIT $2
            """,
            settings.README_SCRAPE_INTERVAL_HOURS / 24.0,
            settings.README_SCRAPE_BATCH_SIZE,
        )
    return [dict(r) for r in rows]


async def _fetch_readme(client: httpx.AsyncClient, full_name: str) -> tuple[str | None, float | None]:
    """Returns (readme_text, rate_limit_wait_seconds). If the second value is
    not None, the caller should stop the whole batch rather than keep
    burning requests against an exhausted rate limit."""
    try:
        resp = await client.get(f"{_API_BASE}/repos/{full_name}/readme")
    except Exception as exc:
        logger.debug("README fetch failed for %s: %s", full_name, exc)
        return None, None

    wait = github_rate_limit_wait(resp)
    if wait is not None:
        return None, wait
    if resp.status_code != 200:
        return None, None
    data = resp.json()
    if data.get("encoding") != "base64":
        return None, None
    text = base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
    return text[:_MAX_README_CHARS], None


async def scrape_readmes() -> None:
    """Fetch and cache READMEs for GitHub-sourced agents that don't have one
    yet (or whose copy is stale), so deployment_guide.py has real source
    material to generate instructions from."""
    start = time.monotonic()
    logger.info("README scrape started")

    agents = await _get_stale_github_agents()
    fetched = 0
    missing = 0
    rate_limited = False

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=github_headers(), follow_redirects=True) as client:
        for agent in agents:
            await asyncio.sleep(_GITHUB_REQUEST_DELAY_SECONDS)
            readme, wait = await _fetch_readme(client, agent["source_id"])
            if wait is not None:
                logger.info(
                    "GitHub rate limit exhausted (%.0fs until reset) during README scrape, stopping at %d/%d",
                    wait, fetched, len(agents),
                )
                rate_limited = True
                break
            if readme is None:
                missing += 1
                continue
            async with get_conn() as conn:
                await conn.execute(
                    "UPDATE agents SET readme_text = $1, readme_fetched_at = NOW() WHERE tracent_id = $2",
                    readme, agent["tracent_id"],
                )
            fetched += 1

    elapsed = time.monotonic() - start
    logger.info(
        "README scrape complete: %d fetched, %d missing/failed, %.1fs%s",
        fetched, missing, elapsed, " [rate limited]" if rate_limited else "",
    )
