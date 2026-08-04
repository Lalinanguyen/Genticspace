import asyncio
import logging
import secrets
import time

import httpx

from app.config import settings
from app.db.database import get_conn
from app.services.description_backfill import (
    _generate_description,
    _infer_industry_tags,
    _normalize_license,
    sanitize_text,
)

logger = logging.getLogger(__name__)

_API_BASE = "https://registry.npmjs.org/-/v1/search"
_TIMEOUT = 10.0
_MAX_RETRIES = 3
# npm's own relevance ranking per query is accurate (verified: top results for
# "mcp-server" etc. are all genuinely relevant); only take each query's best
# matches. Pulling the full page and re-ranking globally by downloads instead
# floods the pool with generically-popular infra packages (dotenv, once, ...)
# that happen to loosely match on a stray keyword.
_MAX_PER_QUERY = 25

_SEARCH_TERMS = [
    "ai agent", "autonomous agent", "ai-agent", "llm agent", "agentic",
    "multi-agent", "tool calling", "function calling", "chatbot agent",
    "mcp-server", "model context protocol", "a2a agent", "agent2agent",
    "langchain agent", "autogen", "crewai", "browser agent", "coding agent",
]

_MCP_MARKERS = {"mcp-server", "mcp-client", "mcp", "model-context-protocol"}
_A2A_MARKERS = {"a2a", "agent2agent", "agent-protocol"}
_X402_MARKERS = {"x402"}


def _npm_tracent_id() -> str:
    return "npm_" + secrets.token_urlsafe(8)


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


async def _search(client: httpx.AsyncClient, term: str) -> list[dict]:
    resp = await _get_with_retry(client, _API_BASE, params={"text": term, "size": _MAX_PER_QUERY})
    if resp is None or resp.status_code != 200:
        return []
    try:
        return resp.json().get("objects", [])
    except Exception:
        return []


def _protocol_flags(keywords: list[str]) -> tuple[bool, bool, bool]:
    kw = {k.lower() for k in keywords}
    return (bool(kw & _MCP_MARKERS), bool(kw & _A2A_MARKERS), bool(kw & _X402_MARKERS))


def _normalize_github_url(repo_url: str | None) -> str | None:
    if not repo_url:
        return None
    url = repo_url.replace("git+", "").replace(".git", "")
    if url.startswith("git://"):
        url = "https://" + url[len("git://"):]
    if url.startswith("git@github.com:"):
        url = "https://github.com/" + url[len("git@github.com:"):]
    return url if "github.com" in url else None


async def _upsert_package(pkg: dict) -> str:
    package = pkg["package"]
    name = package["name"]
    source_id = name
    description = sanitize_text((package.get("description") or "")[:2000]) or None
    links = package.get("links") or {}
    web_endpoint = links.get("npm") or f"https://www.npmjs.com/package/{name}"
    github_url = _normalize_github_url(links.get("repository"))
    keywords = package.get("keywords") or []
    is_mcp, is_a2a, has_x402 = _protocol_flags(keywords)
    publisher = (package.get("publisher") or {}).get("username")
    license_name = _normalize_license(package.get("license"))
    industry_tags = _infer_industry_tags(keywords) or None

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT tracent_id FROM agents WHERE source = 'npm' AND source_id = $1",
            source_id,
        )
        tracent_id = existing["tracent_id"] if existing else _npm_tracent_id()

        await conn.execute(
            """
            INSERT INTO agents (
                tracent_id, source, source_id,
                name, description, web_endpoint, github_url,
                a2a_endpoint, mcp_endpoint, x402_support,
                provider_org, provider_url,
                license, industry_tags, deployment_types,
                is_active, last_indexed
            ) VALUES (
                $1, 'npm', $2,
                $3, $4, $5, $6,
                $7, $8, $9,
                $10, $11,
                $12, $13, ARRAY['On-prem'],
                TRUE, NOW()
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                name          = EXCLUDED.name,
                description   = COALESCE(agents.description, EXCLUDED.description),
                web_endpoint  = EXCLUDED.web_endpoint,
                github_url    = EXCLUDED.github_url,
                a2a_endpoint  = EXCLUDED.a2a_endpoint,
                mcp_endpoint  = EXCLUDED.mcp_endpoint,
                x402_support  = EXCLUDED.x402_support,
                provider_org  = EXCLUDED.provider_org,
                provider_url  = EXCLUDED.provider_url,
                license       = COALESCE(agents.license, EXCLUDED.license),
                industry_tags = CASE WHEN agents.industry_tags IS NULL THEN EXCLUDED.industry_tags ELSE agents.industry_tags END,
                last_indexed  = NOW()
            """,
            tracent_id, source_id,
            name, description, web_endpoint, github_url,
            web_endpoint if is_a2a else None,
            web_endpoint if is_mcp else None,
            has_x402,
            publisher, f"https://www.npmjs.com/~{publisher}" if publisher else None,
            license_name, industry_tags,
        )

    return tracent_id


async def _process_candidate(client: httpx.AsyncClient, sem: asyncio.Semaphore, pkg: dict) -> bool:
    async with sem:
        try:
            tracent_id = await _upsert_package(pkg)
        except Exception as exc:
            logger.warning("Failed to upsert npm package %s: %s", pkg.get("package", {}).get("name"), exc)
            return False

    from app.services.verifier import run_auto_verification
    try:
        await run_auto_verification(tracent_id)
    except Exception as exc:
        logger.debug("Verification failed for %s: %s", tracent_id, exc)
    return True


async def scrape_npm() -> None:
    """Discover and index agent-relevant npm packages."""
    start = time.monotonic()
    logger.info("npm scrape started")

    candidates: dict[str, dict] = {}

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for term in _SEARCH_TERMS:
            for item in await _search(client, term):
                name = item.get("package", {}).get("name")
                if name and name not in candidates:
                    candidates[name] = item

        logger.info("npm discovery found %d unique package candidates", len(candidates))

        ranked = sorted(
            candidates.values(),
            key=lambda i: i.get("score", {}).get("final", 0),
            reverse=True,
        )
        selected = ranked[: settings.NPM_SCRAPE_MAX_CANDIDATES]
        logger.info(
            "Processing top %d of %d candidates by search relevance (NPM_SCRAPE_MAX_CANDIDATES)",
            len(selected), len(ranked),
        )

        sem = asyncio.Semaphore(settings.NPM_SCRAPE_CONCURRENCY)
        results = await asyncio.gather(*(_process_candidate(client, sem, pkg) for pkg in selected))
        total = sum(1 for r in results if r)

    elapsed = time.monotonic() - start
    logger.info(
        "npm scrape complete: %d candidates found, %d processed, %d upserted, %.1fs",
        len(ranked), len(selected), total, elapsed,
    )


# ---------------------------------------------------------------------------
# Backfill — the search index used by scrape_npm() above only returns a thin
# subset of a package's real metadata. registry.npmjs.org/{package} (the full
# package doc, not the search endpoint) carries the actual license, keywords,
# and README text, so existing rows missing fields get a second, richer pass.
# ---------------------------------------------------------------------------
def _npm_license_key(license_field) -> str | None:
    if isinstance(license_field, dict):
        return license_field.get("type")
    if isinstance(license_field, str):
        return license_field
    return None


async def _get_npm_backfill_batch(batch_size: int) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT tracent_id, source_id, name, description FROM agents
            WHERE source = 'npm' AND npm_enriched_at IS NULL
            ORDER BY last_indexed ASC
            LIMIT $1
            """,
            batch_size,
        )
    return [dict(r) for r in rows]


async def backfill_npm(batch_size: int | None = None) -> None:
    start = time.monotonic()
    batch = await _get_npm_backfill_batch(batch_size or settings.NPM_ENRICH_BATCH_SIZE)
    if not batch:
        logger.info("npm enrichment: nothing to backfill")
        return

    updated = 0
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        for agent in batch:
            package_path = agent["source_id"].replace("/", "%2F")
            resp = await _get_with_retry(client, f"https://registry.npmjs.org/{package_path}")
            if resp is None:
                continue  # transient — leave npm_enriched_at NULL, retry later
            if resp.status_code != 200:
                # unpublished/gone — nothing more to learn, stop retrying it
                async with get_conn() as conn:
                    await conn.execute(
                        "UPDATE agents SET npm_enriched_at = NOW() WHERE tracent_id = $1",
                        agent["tracent_id"],
                    )
                continue

            try:
                data = resp.json()
            except Exception:
                continue

            latest_tag = (data.get("dist-tags") or {}).get("latest")
            version_data = (data.get("versions") or {}).get(latest_tag, {}) if latest_tag else {}
            license_key = _npm_license_key(version_data.get("license") or data.get("license"))
            keywords = version_data.get("keywords") or data.get("keywords") or []
            readme_text = data.get("readme")
            if readme_text and readme_text.strip().lower() in ("no readme data", "no readme found."):
                readme_text = None

            description = agent["description"]
            if (not description or len(description) < 10) and readme_text and len(readme_text) > 60:
                description = await _generate_description(agent["name"] or agent["source_id"], readme_text, keywords)

            industry_tags = _infer_industry_tags(keywords)
            license_name = _normalize_license(license_key)

            async with get_conn() as conn:
                await conn.execute(
                    """
                    UPDATE agents SET
                        description = COALESCE(NULLIF(trim(description), ''), $2),
                        license = COALESCE(license, $3),
                        industry_tags = CASE WHEN industry_tags IS NULL OR array_length(industry_tags, 1) IS NULL
                                             THEN $4 ELSE industry_tags END,
                        readme_text = COALESCE($5, readme_text),
                        readme_fetched_at = CASE WHEN $5 IS NOT NULL THEN NOW() ELSE readme_fetched_at END,
                        npm_enriched_at = NOW()
                    WHERE tracent_id = $1
                    """,
                    agent["tracent_id"], description, license_name, industry_tags or None, readme_text,
                )
            updated += 1

    elapsed = time.monotonic() - start
    logger.info("npm enrichment complete: %d/%d updated, %.1fs", updated, len(batch), elapsed)
