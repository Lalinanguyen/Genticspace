import asyncio
import logging
import secrets
import time
from datetime import datetime, timezone

import httpx

from app.db.database import get_conn

logger = logging.getLogger(__name__)

_SEED_DOMAINS = [
    "microsoft.com",
    "google.com",
    "cisco.com",
    "nvidia.com",
    "salesforce.com",
    "huggingface.co",
    "snowflake.com",
    "databricks.com",
    "github.com",
    "godaddy.com",
    "servicenow.com",
]

_CATALOG_PATH = "/.well-known/ai-catalog.json"
_TIMEOUT = 10.0
_MIN_CRAWL_INTERVAL_SECS = 23 * 3600


def _ard_genticspace_id() -> str:
    return "ard_" + secrets.token_urlsafe(8)


def _extract_publisher(catalog: dict) -> str | None:
    pub = catalog.get("publisher")
    if isinstance(pub, dict):
        return pub.get("name") or pub.get("url")
    if isinstance(pub, str):
        return pub
    return None


def _extract_endpoints(agent: dict) -> tuple[str | None, str | None, str | None]:
    endpoints = agent.get("endpoints") or {}
    if not isinstance(endpoints, dict):
        return None, None, None
    return (
        endpoints.get("a2a") or None,
        endpoints.get("mcp") or None,
        endpoints.get("web") or None,
    )


async def _get_active_domains() -> list[str]:
    async with get_conn() as conn:
        rows = await conn.fetch("SELECT domain FROM ard_domains WHERE active = TRUE")
    return [r["domain"] for r in rows]


async def _get_last_crawled(domain: str) -> datetime | None:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT last_crawled FROM ard_domains WHERE domain = $1", domain
        )
    return row["last_crawled"] if row and row["last_crawled"] else None


async def _crawl_domain(client: httpx.AsyncClient, domain: str) -> int:
    url = f"https://{domain}{_CATALOG_PATH}"
    try:
        resp = await client.get(url)
        if resp.status_code == 404:
            logger.debug("No catalog at %s (404)", url)
            return 0
        resp.raise_for_status()
        catalog = resp.json()
    except httpx.TimeoutException:
        logger.debug("Timeout fetching %s", url)
        return 0
    except httpx.HTTPStatusError as exc:
        logger.debug("HTTP %d for %s", exc.response.status_code, url)
        return 0
    except Exception as exc:
        logger.debug("Failed to fetch or parse %s: %s", url, exc)
        return 0

    if not isinstance(catalog, dict):
        logger.debug("Non-object catalog at %s", url)
        return 0

    agents = catalog.get("agents") or []
    if not isinstance(agents, list):
        agents = []

    publisher = _extract_publisher(catalog)
    count = 0

    async with get_conn() as conn:
        for agent in agents:
            if not isinstance(agent, dict):
                continue
            agent_id = agent.get("id") or agent.get("name")
            if not agent_id:
                continue
            source_id = f"{domain}/{agent_id}"
            name = agent.get("name") or str(agent_id)
            description = agent.get("description")
            a2a, mcp, web = _extract_endpoints(agent)

            existing = await conn.fetchrow(
                "SELECT genticspace_id FROM agents WHERE source = 'ard' AND source_id = $1",
                source_id,
            )
            genticspace_id = existing["genticspace_id"] if existing else _ard_genticspace_id()

            await conn.execute(
                """
                INSERT INTO agents (
                    genticspace_id, source, source_id, domain,
                    name, description,
                    a2a_endpoint, mcp_endpoint, web_endpoint,
                    provider_org,
                    last_indexed
                ) VALUES (
                    $1, 'ard', $2, $3,
                    $4, $5,
                    $6, $7, $8,
                    $9,
                    NOW()
                )
                ON CONFLICT (source, source_id) DO UPDATE SET
                    name         = EXCLUDED.name,
                    description  = COALESCE(NULLIF(trim(EXCLUDED.description), ''), agents.description),
                    a2a_endpoint = EXCLUDED.a2a_endpoint,
                    mcp_endpoint = EXCLUDED.mcp_endpoint,
                    web_endpoint = EXCLUDED.web_endpoint,
                    provider_org = EXCLUDED.provider_org,
                    last_indexed = NOW()
                """,
                genticspace_id, source_id, domain,
                name, description,
                a2a, mcp, web,
                publisher,
            )
            count += 1

    return count


async def crawl_ard() -> None:
    start = time.monotonic()
    logger.info("ARD crawl started")

    try:
        db_domains = await _get_active_domains()
    except Exception as exc:
        logger.error("Failed to load ard_domains from DB: %s", exc)
        db_domains = []

    # Seed list first, then any extra domains added via admin API; deduplicate preserving order
    all_domains = list(dict.fromkeys(_SEED_DOMAINS + db_domains))
    domains_hit = 0
    domains_skipped = 0
    total_agents = 0

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        for domain in all_domains:
            count = 0
            try:
                last_crawled = await _get_last_crawled(domain)
                if last_crawled is not None:
                    age_secs = (datetime.now(timezone.utc) - last_crawled).total_seconds()
                    if age_secs < _MIN_CRAWL_INTERVAL_SECS:
                        logger.debug(
                            "Skipping %s, crawled %.1fh ago", domain, age_secs / 3600
                        )
                        domains_skipped += 1
                        continue

                count = await _crawl_domain(client, domain)
                if count > 0:
                    domains_hit += 1
                total_agents += count
            except Exception as exc:
                logger.warning("Unexpected error crawling %s: %s", domain, exc)

            try:
                async with get_conn() as conn:
                    await conn.execute(
                        """
                        INSERT INTO ard_domains (domain, last_crawled, agent_count)
                        VALUES ($1, NOW(), $2)
                        ON CONFLICT (domain) DO UPDATE SET
                            last_crawled = NOW(),
                            agent_count  = EXCLUDED.agent_count
                        """,
                        domain, count,
                    )
            except Exception as exc:
                logger.warning("Failed to update ard_domains for %s: %s", domain, exc)

            await asyncio.sleep(1)

    elapsed = time.monotonic() - start
    logger.info(
        "ARD crawl complete: %d agents indexed, %d/%d domains hit, %d skipped (recent), %.1fs",
        total_agents, domains_hit, len(all_domains) - domains_skipped, domains_skipped, elapsed,
    )
