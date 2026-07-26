import asyncio
import logging
import re
import secrets
import time
from urllib.parse import urlparse

import httpx

from app.config import settings
from app.db.database import get_conn
from app.services.description_backfill import _INDUSTRY_KEYWORDS, _infer_industry_tags, sanitize_text

logger = logging.getLogger(__name__)

_SITEMAP_URL = "https://www.futurepedia.io/sitemap_tools.xml"
_TIMEOUT = 15.0
_MAX_RETRIES = 3
# Identifies us honestly to the site we're reading, per robots.txt (which
# permits User-agent: * on /tool/*) rather than spoofing a browser UA.
_USER_AGENT = "TracentBot/1.0 (+https://genticspace.com; AI agent registry)"

_LOC_RE = re.compile(r"<loc>(.*?)</loc>\s*<lastmod>(.*?)</lastmod>", re.DOTALL)
_H1_RE = re.compile(r"<h1[^>]*>([^<]*)</h1>")
_OG_DESC_RE = re.compile(r'<meta property="og:description" content="([^"]*)"')
_WEBSITE_LINK_RE = re.compile(
    r'https://([a-zA-Z0-9.-]+)/\?utm_source=futurepedia(?:\.io)?&amp;utm_medium=marketplace'
)
_LOGO_RE = re.compile(r'<img alt="[^"]*Logo"[^>]*src="([^"]*)"')
_PRICING_RE = re.compile(r'Pricing Model:\s*</span>\s*<div>([^<]*)</div>')
_CATEGORIES_BLOCK_RE = re.compile(r'AI Categories:\s*</span>(.*?)</p>', re.DOTALL)
_CATEGORY_SLUG_RE = re.compile(r'/ai-tools/([a-zA-Z0-9-]+)"')


def _headers() -> dict:
    return {"User-Agent": _USER_AGENT}


async def _get_with_retry(client: httpx.AsyncClient, url: str) -> httpx.Response | None:
    delay = 2.0
    for attempt in range(_MAX_RETRIES):
        try:
            resp = await client.get(url)
        except Exception as exc:
            logger.debug("GET %s failed: %s", url, exc)
            return None
        if resp.status_code != 429:
            return resp
        await asyncio.sleep(delay)
        delay *= 2
    return None


async def _fetch_sitemap(client: httpx.AsyncClient) -> list[tuple[str, str]]:
    resp = await _get_with_retry(client, _SITEMAP_URL)
    if resp is None or resp.status_code != 200:
        logger.warning("Futurepedia sitemap fetch failed: %s", resp.status_code if resp else "no response")
        return []
    return [(loc.strip(), lastmod.strip()) for loc, lastmod in _LOC_RE.findall(resp.text)]


def _slug_from_url(url: str) -> str | None:
    path = urlparse(url).path
    if not path.startswith("/tool/"):
        return None
    slug = path[len("/tool/"):].strip("/")
    return slug or None


async def _get_existing_slugs() -> set[str]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT source_id FROM agents WHERE source = 'futurepedia'"
        )
    return {r["source_id"] for r in rows}


def _extract_pricing_and_categories(html: str) -> tuple[str | None, list[str]]:
    pricing_match = _PRICING_RE.search(html)
    pricing = pricing_match.group(1).strip() or None if pricing_match else None
    categories: list[str] = []
    cat_block = _CATEGORIES_BLOCK_RE.search(html)
    if cat_block:
        categories = _CATEGORY_SLUG_RE.findall(cat_block.group(1))
    return pricing, categories


async def _fetch_tool(client: httpx.AsyncClient, url: str) -> dict | None:
    resp = await _get_with_retry(client, url)
    if resp is None or resp.status_code != 200:
        return None
    html = resp.text

    h1_match = _H1_RE.search(html)
    name = h1_match.group(1).strip() if h1_match else None
    if not name:
        return None

    desc_match = _OG_DESC_RE.search(html)
    description = sanitize_text(desc_match.group(1).replace("&amp;", "&").strip()[:2000]) if desc_match else None

    website_match = _WEBSITE_LINK_RE.search(html)
    web_endpoint = f"https://{website_match.group(1)}" if website_match else url

    logo_match = _LOGO_RE.search(html)
    image_url = logo_match.group(1).replace("&amp;", "&") if logo_match else None

    pricing_model, categories = _extract_pricing_and_categories(html)

    return {
        "name": name,
        "description": description,
        "web_endpoint": web_endpoint,
        "image_url": image_url,
        "pricing_model": pricing_model,
        "categories": categories,
    }


def _tracent_id() -> str:
    return "fp_" + secrets.token_urlsafe(8)


def _infer_industry_tags_from_text(text: str) -> list[str] | None:
    lowered = text.lower()
    matches = [
        industry
        for industry, markers in _INDUSTRY_KEYWORDS.items()
        if any(marker.replace("-", " ") in lowered for marker in markers)
    ]
    return matches or None


async def _upsert_tool(source_id: str, futurepedia_url: str, data: dict) -> str:
    industry_tags = (
        _infer_industry_tags_from_text(data["description"] or "")
        or _infer_industry_tags(data.get("categories") or [])
        or None
    )

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT tracent_id FROM agents WHERE source = 'futurepedia' AND source_id = $1",
            source_id,
        )
        tracent_id = existing["tracent_id"] if existing else _tracent_id()

        await conn.execute(
            """
            INSERT INTO agents (
                tracent_id, source, source_id,
                name, description, web_endpoint, provider_url, image_url,
                industry_tags, pricing_model, deployment_types,
                is_active, last_indexed, futurepedia_enriched_at
            ) VALUES (
                $1, 'futurepedia', $2,
                $3, $4, $5, $6, $7,
                $8, $9, ARRAY['Cloud'],
                TRUE, NOW(), NOW()
            )
            ON CONFLICT (source, source_id) DO UPDATE SET
                name          = EXCLUDED.name,
                description   = COALESCE(agents.description, EXCLUDED.description),
                web_endpoint  = EXCLUDED.web_endpoint,
                provider_url  = EXCLUDED.provider_url,
                image_url     = COALESCE(agents.image_url, EXCLUDED.image_url),
                industry_tags = CASE WHEN agents.industry_tags IS NULL THEN EXCLUDED.industry_tags ELSE agents.industry_tags END,
                pricing_model = COALESCE(agents.pricing_model, EXCLUDED.pricing_model),
                last_indexed  = NOW(),
                futurepedia_enriched_at = NOW()
            """,
            tracent_id, source_id,
            data["name"], data["description"], data["web_endpoint"], futurepedia_url, data.get("image_url"),
            industry_tags, data.get("pricing_model"),
        )

    return tracent_id


async def scrape_futurepedia() -> None:
    """Discover AI tool listings from Futurepedia's public tools sitemap.

    Reads only /tool/* pages (permitted by robots.txt for User-agent: *),
    identifies itself honestly via User-Agent, and runs at low concurrency
    with backoff — this is a directory with no official API, so we keep our
    footprint light and are explicit about being a bot.
    """
    start = time.monotonic()
    logger.info("Futurepedia scrape started")

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_headers(), follow_redirects=True) as client:
        entries = await _fetch_sitemap(client)
        if not entries:
            logger.info("Futurepedia scrape: no sitemap entries found")
            return

        existing = await _get_existing_slugs()

        # Prioritize recently-updated tools first, skip ones we already have.
        entries.sort(key=lambda e: e[1], reverse=True)
        candidates = []
        for url, _ in entries:
            slug = _slug_from_url(url)
            if slug and slug not in existing:
                candidates.append((slug, url))
            if len(candidates) >= settings.FUTUREPEDIA_SCRAPE_BATCH_SIZE:
                break

        logger.info(
            "Futurepedia sitemap has %d tools, %d new candidates selected this run",
            len(entries), len(candidates),
        )

        sem = asyncio.Semaphore(settings.FUTUREPEDIA_SCRAPE_CONCURRENCY)
        upserted = 0

        async def process(slug: str, url: str) -> None:
            nonlocal upserted
            async with sem:
                await asyncio.sleep(settings.FUTUREPEDIA_SCRAPE_DELAY_SECONDS)
                data = await _fetch_tool(client, url)
            if not data:
                return
            try:
                tracent_id = await _upsert_tool(slug, url, data)
            except Exception as exc:
                logger.warning("Failed to upsert Futurepedia tool %s: %s", slug, exc)
                return
            from app.services.verifier import run_auto_verification
            try:
                await run_auto_verification(tracent_id)
            except Exception as exc:
                logger.debug("Verification failed for %s: %s", tracent_id, exc)
            upserted += 1

        await asyncio.gather(*(process(slug, url) for slug, url in candidates))

    elapsed = time.monotonic() - start
    logger.info(
        "Futurepedia scrape complete: %d candidates, %d upserted, %.1fs",
        len(candidates), upserted, elapsed,
    )


# ---------------------------------------------------------------------------
# Backfill — pricing_model/category-refined industry_tags were added after
# the initial 1300+ tools were already indexed, so existing rows need a
# second pass over their (already-known) tool page to pick those fields up.
# ---------------------------------------------------------------------------
async def _get_futurepedia_backfill_batch(batch_size: int) -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT tracent_id, provider_url FROM agents
            WHERE source = 'futurepedia' AND futurepedia_enriched_at IS NULL
            ORDER BY last_indexed ASC
            LIMIT $1
            """,
            batch_size,
        )
    return [dict(r) for r in rows]


async def backfill_futurepedia(batch_size: int | None = None) -> None:
    start = time.monotonic()
    batch = await _get_futurepedia_backfill_batch(batch_size or settings.FUTUREPEDIA_ENRICH_BATCH_SIZE)
    if not batch:
        logger.info("Futurepedia enrichment: nothing to backfill")
        return

    updated = 0
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_headers(), follow_redirects=True) as client:
        for agent in batch:
            url = agent["provider_url"]
            if not url:
                async with get_conn() as conn:
                    await conn.execute(
                        "UPDATE agents SET futurepedia_enriched_at = NOW() WHERE tracent_id = $1",
                        agent["tracent_id"],
                    )
                continue

            await asyncio.sleep(settings.FUTUREPEDIA_SCRAPE_DELAY_SECONDS)
            resp = await _get_with_retry(client, url)
            if resp is None:
                continue  # transient — leave futurepedia_enriched_at NULL, retry later
            if resp.status_code != 200:
                # tool page gone/moved — nothing more to learn, stop retrying it
                async with get_conn() as conn:
                    await conn.execute(
                        "UPDATE agents SET futurepedia_enriched_at = NOW() WHERE tracent_id = $1",
                        agent["tracent_id"],
                    )
                continue

            pricing_model, categories = _extract_pricing_and_categories(resp.text)
            industry_tags = _infer_industry_tags(categories) or None
            logo_match = _LOGO_RE.search(resp.text)
            image_url = logo_match.group(1).replace("&amp;", "&") if logo_match else None

            async with get_conn() as conn:
                await conn.execute(
                    """
                    UPDATE agents SET
                        pricing_model = COALESCE(pricing_model, $2),
                        industry_tags = CASE WHEN industry_tags IS NULL OR array_length(industry_tags, 1) IS NULL
                                             THEN $3 ELSE industry_tags END,
                        image_url = COALESCE(image_url, $4),
                        futurepedia_enriched_at = NOW()
                    WHERE tracent_id = $1
                    """,
                    agent["tracent_id"], pricing_model, industry_tags, image_url,
                )
            updated += 1

    elapsed = time.monotonic() - start
    logger.info("Futurepedia enrichment complete: %d/%d updated, %.1fs", updated, len(batch), elapsed)
