import asyncio
import logging
from datetime import datetime, timedelta, timezone

import httpx

from app.db.database import get_conn
from app.services.github_analysis import analyze_github_username, github_headers

logger = logging.getLogger(__name__)

_CACHE_TTL = timedelta(hours=24)


async def _fetch_cache_row(user_id: int):
    async with get_conn() as conn:
        return await conn.fetchrow(
            "SELECT * FROM github_repo_cache WHERE user_id = $1", user_id
        )


async def _upsert_cache(user_id: int, github_username: str, languages: list[str],
                         detected_libs: list[str], repo_count: int, rate_limited: bool):
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO github_repo_cache (user_id, github_username, languages, detected_libs, repo_count, fetched_at, rate_limited)
            VALUES ($1, $2, $3, $4, $5, NOW(), $6)
            ON CONFLICT (user_id) DO UPDATE SET
                github_username = EXCLUDED.github_username,
                languages = EXCLUDED.languages,
                detected_libs = EXCLUDED.detected_libs,
                repo_count = EXCLUDED.repo_count,
                fetched_at = EXCLUDED.fetched_at,
                rate_limited = EXCLUDED.rate_limited
            """,
            user_id, github_username, languages, detected_libs, repo_count, rate_limited,
        )


async def refresh_github_signals(user_id: int, github_username: str | None, force: bool = False) -> dict | None:
    if not github_username:
        return None

    existing = await _fetch_cache_row(user_id)
    if existing and not force and existing["fetched_at"]:
        if datetime.now(timezone.utc) - existing["fetched_at"] < _CACHE_TTL:
            return dict(existing)

    async with httpx.AsyncClient(timeout=10.0, headers=github_headers()) as client:
        analysis = await analyze_github_username(client, github_username)

    languages = analysis.languages
    detected_libs = analysis.detected_libs
    repo_count = analysis.repo_count

    if analysis.rate_limited and existing:
        # keep prior data, just merge in whatever we did manage to fetch
        languages = set(existing["languages"] or []) | languages
        detected_libs = set(existing["detected_libs"] or []) | detected_libs
        repo_count = existing["repo_count"] or repo_count

    await _upsert_cache(
        user_id, github_username, sorted(languages), sorted(detected_libs), repo_count, analysis.rate_limited
    )
    return await _fetch_cache_row(user_id)


async def get_github_signals_nonblocking(user_id: int, github_username: str | None) -> dict | None:
    """Request-path-safe version of refresh_github_signals: analyzing a
    user's repos means up to ~20 sequential GitHub API calls, far too slow
    to do inline on every recommendations request. Returns whatever's
    already cached immediately (possibly None) and, if the cache is stale
    or missing, kicks off a real refresh in the background so the next
    request benefits from it — never blocks the caller on live GitHub
    calls."""
    if not github_username:
        return None

    existing = await _fetch_cache_row(user_id)
    is_stale = not existing or not existing["fetched_at"] or (
        datetime.now(timezone.utc) - existing["fetched_at"] >= _CACHE_TTL
    )
    if is_stale:
        async def _background_refresh():
            try:
                await refresh_github_signals(user_id, github_username, force=True)
            except Exception as exc:
                logger.debug("Background GitHub signal refresh failed for user %s: %s", user_id, exc)

        asyncio.create_task(_background_refresh())

    return dict(existing) if existing else None
