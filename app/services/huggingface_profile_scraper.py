import logging
import time

import httpx

from app.config import settings
from app.db.database import get_conn

logger = logging.getLogger(__name__)

_API_BASE = "https://huggingface.co/api"
_TIMEOUT = 10.0


def _headers() -> dict:
    headers = {}
    if settings.HUGGINGFACE_TOKEN:
        headers["Authorization"] = f"Bearer {settings.HUGGINGFACE_TOKEN}"
    return headers


async def _get_known_authors() -> list[str]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT DISTINCT provider_org FROM agents WHERE source = 'huggingface' AND provider_org IS NOT NULL"
        )
    return [r["provider_org"] for r in rows]


async def _fetch_overview(client: httpx.AsyncClient, username: str) -> dict | None:
    try:
        resp = await client.get(f"{_API_BASE}/users/{username}/overview")
        if resp.status_code == 200:
            data = resp.json()
            data["_profile_type"] = "user"
            return data
    except Exception as exc:
        logger.debug("HF user overview failed for %s: %s", username, exc)

    try:
        resp = await client.get(f"{_API_BASE}/organizations/{username}/overview")
        if resp.status_code == 200:
            data = resp.json()
            data["_profile_type"] = "org"
            return data
    except Exception as exc:
        logger.debug("HF org overview failed for %s: %s", username, exc)

    return None


async def _aggregate_agent_signals(username: str) -> tuple[list[str], int]:
    """Derive protocol signals for an HF profile from the models/Spaces of
    theirs we've already indexed — HF has no codebase to sample directly the
    way GitHub does, so this aggregates what scrape_huggingface() already
    detected from tags across their published agents."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*) AS agent_count,
                BOOL_OR(mcp_endpoint IS NOT NULL) AS has_mcp,
                BOOL_OR(a2a_endpoint IS NOT NULL) AS has_a2a,
                BOOL_OR(x402_support) AS has_x402
            FROM agents WHERE source = 'huggingface' AND provider_org = $1
            """,
            username,
        )
    libs = []
    if row["has_mcp"]:
        libs.append("mcp")
    if row["has_a2a"]:
        libs.append("a2a")
    if row["has_x402"]:
        libs.append("x402")
    return libs, row["agent_count"] or 0


async def _upsert_profile(username: str, data: dict) -> None:
    profile_type = data["_profile_type"]
    detected_libs, agent_count = await _aggregate_agent_signals(username)

    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO huggingface_profiles (
                username, profile_type, display_name, avatar_url, bio,
                is_pro, is_verified, num_models, num_datasets, num_spaces, num_followers,
                detected_libs, agent_count,
                last_updated
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
            ON CONFLICT (username) DO UPDATE SET
                profile_type  = EXCLUDED.profile_type,
                display_name  = EXCLUDED.display_name,
                avatar_url    = EXCLUDED.avatar_url,
                bio           = EXCLUDED.bio,
                is_pro        = EXCLUDED.is_pro,
                is_verified   = EXCLUDED.is_verified,
                num_models    = EXCLUDED.num_models,
                num_datasets  = EXCLUDED.num_datasets,
                num_spaces    = EXCLUDED.num_spaces,
                num_followers = EXCLUDED.num_followers,
                detected_libs = EXCLUDED.detected_libs,
                agent_count   = EXCLUDED.agent_count,
                last_updated  = NOW()
            """,
            username,
            profile_type,
            data.get("fullname"),
            data.get("avatarUrl"),
            data.get("details"),
            data.get("isPro", False),
            data.get("isVerified", False),
            data.get("numModels"),
            data.get("numDatasets"),
            data.get("numSpaces"),
            data.get("numFollowers"),
            detected_libs,
            agent_count,
        )


async def scrape_huggingface_profiles() -> None:
    start = time.monotonic()
    logger.info("Hugging Face profile scrape started")

    usernames = await _get_known_authors()
    fetched = 0
    missing = 0

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_headers()) as client:
        for username in usernames:
            data = await _fetch_overview(client, username)
            if data is None:
                missing += 1
                continue
            try:
                await _upsert_profile(username, data)
                fetched += 1
            except Exception as exc:
                logger.warning("Failed to upsert HF profile %s: %s", username, exc)

    elapsed = time.monotonic() - start
    logger.info(
        "Hugging Face profile scrape complete: %d profiles updated, %d not found, %.1fs",
        fetched, missing, elapsed,
    )
