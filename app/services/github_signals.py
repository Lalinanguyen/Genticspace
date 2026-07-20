from datetime import datetime, timedelta, timezone

import httpx

from app.db.database import get_conn
from app.services.github_analysis import analyze_github_username, github_headers

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
