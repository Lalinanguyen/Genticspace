import asyncio
import logging

import httpx

from app.db.database import get_conn

logger = logging.getLogger(__name__)

_TIMEOUT = 5.0
_MAX_429_RETRIES = 2


async def _request_with_backoff(client: httpx.AsyncClient, method: str, url: str) -> httpx.Response | None:
    delay = 1.0
    for attempt in range(_MAX_429_RETRIES + 1):
        try:
            resp = await client.request(method, url)
        except Exception as exc:
            logger.debug("%s %s failed: %s", method, url, exc)
            return None
        if resp.status_code != 429 or attempt == _MAX_429_RETRIES:
            return resp
        wait = float(resp.headers.get("retry-after", delay))
        logger.debug("Rate limited on %s %s, backing off %.1fs", method, url, wait)
        await asyncio.sleep(wait)
        delay *= 2
    return None


async def check_endpoints(genticspace_id: str) -> bool:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT a2a_endpoint, mcp_endpoint, web_endpoint FROM agents WHERE genticspace_id = $1",
            genticspace_id,
        )
    if not row:
        return False

    endpoints = [row["a2a_endpoint"], row["mcp_endpoint"], row["web_endpoint"]]
    endpoints = [e for e in endpoints if e]

    if not endpoints:
        live = False
    else:
        live = False
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            for url in endpoints:
                try:
                    resp = await _request_with_backoff(client, "HEAD", url)
                    if resp is not None and resp.status_code == 200:
                        live = True
                        break
                    resp2 = await _request_with_backoff(client, "GET", url)
                    if resp2 is not None and resp2.status_code == 200:
                        live = True
                        break
                except Exception as exc:
                    logger.debug("Endpoint check failed for %s: %s", url, exc)

    async with get_conn() as conn:
        await conn.execute(
            "UPDATE agents SET endpoints_live = $1 WHERE genticspace_id = $2",
            live, genticspace_id,
        )
    return live


async def check_all_endpoints() -> None:
    logger.info("Running endpoint health checks for all active agents")
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT genticspace_id FROM agents WHERE is_active = TRUE"
        )
    for row in rows:
        try:
            await check_endpoints(row["genticspace_id"])
        except Exception as exc:
            logger.error("Endpoint check error for %s: %s", row["genticspace_id"], exc)
    logger.info("Endpoint checks complete for %d agents", len(rows))
