import asyncio
import logging
import time

import httpx

from app.config import settings
from app.db.database import get_conn
from app.services.github_analysis import analyze_github_username, github_headers, github_rate_limit_wait

logger = logging.getLogger(__name__)

_API_BASE = "https://api.github.com"
_TIMEOUT = 10.0


async def _get_known_authors() -> list[str]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT provider_org FROM agents WHERE source = 'github' AND provider_org IS NOT NULL"
        )
    return [r["provider_org"] for r in rows]


async def _fetch_profile(client: httpx.AsyncClient, username: str) -> tuple[dict | None, float | None]:
    """Returns (profile, rate_limit_wait_seconds)."""
    try:
        resp = await client.get(f"{_API_BASE}/users/{username}")
    except Exception as exc:
        logger.debug("GitHub profile fetch failed for %s: %s", username, exc)
        return None, None

    wait = github_rate_limit_wait(resp)
    if wait is not None:
        return None, wait
    if resp.status_code == 200:
        return resp.json(), None
    return None, None


async def _upsert_profile(client: httpx.AsyncClient, username: str, data: dict) -> None:
    analysis = await analyze_github_username(client, username)

    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO github_profiles (
                username, profile_type, display_name, avatar_url, bio,
                company, location, blog_url, twitter_handle,
                public_repos, followers, following,
                detected_languages, detected_libs, repos_analyzed, rate_limited,
                last_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
            ON CONFLICT (username) DO UPDATE SET
                profile_type       = EXCLUDED.profile_type,
                display_name       = EXCLUDED.display_name,
                avatar_url          = EXCLUDED.avatar_url,
                bio                 = EXCLUDED.bio,
                company             = EXCLUDED.company,
                location            = EXCLUDED.location,
                blog_url            = EXCLUDED.blog_url,
                twitter_handle      = EXCLUDED.twitter_handle,
                public_repos        = EXCLUDED.public_repos,
                followers           = EXCLUDED.followers,
                following           = EXCLUDED.following,
                detected_languages  = EXCLUDED.detected_languages,
                detected_libs       = EXCLUDED.detected_libs,
                repos_analyzed      = EXCLUDED.repos_analyzed,
                rate_limited        = EXCLUDED.rate_limited,
                last_updated        = NOW()
            """,
            username,
            "org" if data.get("type") == "Organization" else "user",
            data.get("name"),
            data.get("avatar_url"),
            data.get("bio"),
            data.get("company"),
            data.get("location"),
            data.get("blog") or None,
            data.get("twitter_username"),
            data.get("public_repos"),
            data.get("followers"),
            data.get("following"),
            sorted(analysis.languages),
            sorted(analysis.detected_libs),
            analysis.repo_count,
            analysis.rate_limited,
        )


async def scrape_github_profiles() -> None:
    start = time.monotonic()
    logger.info("GitHub profile scrape started")

    usernames = await _get_known_authors()
    fetched = 0
    missing = 0
    rate_limited = False

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=github_headers(), follow_redirects=True) as client:
        for username in usernames:
            data, wait = await _fetch_profile(client, username)
            if wait is not None:
                logger.info(
                    "GitHub rate limit exhausted (%.0fs until reset) during profile scrape, stopping at %d/%d",
                    wait, fetched, len(usernames),
                )
                rate_limited = True
                break
            if data is None:
                missing += 1
                continue
            try:
                await _upsert_profile(client, username, data)
                fetched += 1
            except Exception as exc:
                logger.warning("Failed to upsert GitHub profile %s: %s", username, exc)

    elapsed = time.monotonic() - start
    logger.info(
        "GitHub profile scrape complete: %d profiles updated, %d not found, %.1fs%s",
        fetched, missing, elapsed, " [rate limited]" if rate_limited else "",
    )
