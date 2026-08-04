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


async def _verify_scoped_key(api_key: str, master_key: str, master_identity: str, scope: str) -> str:
    """
    Two-tier key check for a given scope ("admin" or "partner"):
      1. The master key for that scope, from settings — checked first via
         constant-time compare.
      2. Per-client keys minted via POST /admin/api-keys, stored as a sha256
         hash in the `api_keys` table with a matching `scope`.
    Returns an identity string (the master sentinel, or the per-client row's
    owner_email) so callers can log who acted, rather than the raw key.
    """
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing API key. Pass your key in the X-API-Key header.",
        )

    if secrets.compare_digest(api_key, master_key):
        return master_identity

    key_hash = hash_api_key(api_key)
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT owner_email FROM api_keys WHERE key_hash = $1 AND scope = $2 AND revoked_at IS NULL",
            key_hash, scope,
        )
    if row is not None:
        return row["owner_email"]

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing API key. Pass your key in the X-API-Key header.",
    )


async def verify_admin_key(api_key: str = Security(_api_key_header)) -> str:
    return await _verify_scoped_key(api_key, settings.ADMIN_API_KEY, "master-admin", "admin")


async def verify_partner_key(api_key: str = Security(_api_key_header)) -> str:
    return await _verify_scoped_key(api_key, settings.PARTNER_API_KEY, "master-partner", "partner")
