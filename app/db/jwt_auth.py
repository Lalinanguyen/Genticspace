import logging
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.db.database import get_conn

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_bearer_scheme = HTTPBearer(auto_error=False)


def create_access_token(user_id: int, email: str, expires_minutes: int | None = None) -> str:
    expires_delta = timedelta(minutes=expires_minutes or settings.JWT_EXPIRES_MINUTES)
    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=_ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc


async def _load_user(user_id: int) -> dict:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, account_type, name, company_name, experience_level,
                   use_case, purposes, bio, github_username, x_handle, linkedin_handle,
                   website_url, huggingface_handle, other_link, email_verified, created_at,
                   industry, is_private, show_follower_count, notify_new_follower, notify_agent_review
            FROM users WHERE id = $1
            """,
            user_id,
        )
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return dict(row)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    payload = decode_access_token(credentials.credentials)
    return await _load_user(int(payload["sub"]))


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict | None:
    if not credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        return await _load_user(int(payload["sub"]))
    except HTTPException:
        return None
