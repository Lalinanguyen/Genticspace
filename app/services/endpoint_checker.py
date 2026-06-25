import logging

import httpx

from app.db.database import get_conn

logger = logging.getLogger(__name__)

_TIMEOUT = 5.0


async def check_endpoints(tracent_id: str) -> bool:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT a2a_endpoint, mcp_endpoint, web_endpoint FROM agents WHERE tracent_id = $1",
            tracent_id,
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
                    resp = await client.head(url)
                    if resp.status_code == 200:
                        live = True
                        break
                    resp2 = await client.get(url)
                    if resp2.status_code == 200:
                        live = True
                        break
                except Exception as exc:
                    logger.debug("Endpoint check failed for %s: %s", url, exc)

    async with get_conn() as conn:
        await conn.execute(
            "UPDATE agents SET endpoints_live = $1 WHERE tracent_id = $2",
            live, tracent_id,
        )
    return live


async def check_all_endpoints() -> None:
    logger.info("Running endpoint health checks for all active agents")
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT tracent_id FROM agents WHERE is_active = TRUE"
        )
    for row in rows:
        try:
            await check_endpoints(row["tracent_id"])
        except Exception as exc:
            logger.error("Endpoint check error for %s: %s", row["tracent_id"], exc)
    logger.info("Endpoint checks complete for %d agents", len(rows))
