import hashlib
import secrets
import logging
from fastapi import Security, HTTPException, status
from fastapi.security import APIKeyHeader
from app.config import settings
from app.db.database import get_conn

logger = logging.getLogger(__name__)

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def hash_api_key(raw_key: str) -> str:
    """sha256 hex digest of a raw API key. The raw key itself is never stored."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


async def verify_api_key(api_key: str = Security(_api_key_header)) -> str:
    """
    Two-tier key check guarding /admin/* (the only key-gated surface —
    end-user auth is the separate JWT system in app/db/jwt_auth.py):

      1. settings.API_KEY — the single master/admin key from the
         environment. Checked first, unchanged from before.
      2. Per-client keys minted via POST /admin/api-keys, stored as a sha256
         hash in the `api_keys` table. Falls back to a hash lookup so a
         valid, non-revoked per-client key also passes.

    Caveat (documented, not solved here): this does not distinguish
    "master/admin" from "per-client" callers — any non-revoked per-client
    key currently grants the same access as the master key to whatever this
    dependency guards, which today is all of /admin/*.
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Pass your key in the X-API-Key header.",
        )

    if secrets.compare_digest(api_key, settings.API_KEY):
        return api_key

    key_hash = hash_api_key(api_key)
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM api_keys WHERE key_hash = $1 AND revoked_at IS NULL",
            key_hash,
        )
    if row is not None:
        return api_key

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API key. Pass your key in the X-API-Key header.",
    )
