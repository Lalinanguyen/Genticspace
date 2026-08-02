import logging
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from app.db.database import get_conn

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_bearer_scheme = HTTPBearer(auto_error=False)


async def create_access_token(user_id: int, email: str, expires_minutes: int | None = None) -> str:
    expires_delta = timedelta(minutes=expires_minutes or settings.JWT_EXPIRES_MINUTES)
    session_id = secrets.token_urlsafe(32)

    async with get_conn() as conn:
        await conn.execute(
            "INSERT INTO sessions (session_id, user_id) VALUES ($1, $2)",
            session_id, user_id,
        )

    payload = {
        "sub": str(user_id),
        "email": email,
        "sid": session_id,
        "exp": datetime.now(timezone.utc) + expires_delta,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=_ALGORITHM)


async def revoke_session(session_id: str) -> None:
    async with get_conn() as conn:
        await conn.execute(
            "UPDATE sessions SET revoked_at = NOW() WHERE session_id = $1 AND revoked_at IS NULL",
            session_id,
        )


async def _check_session_active(session_id: str | None) -> None:
    if not session_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT revoked_at FROM sessions WHERE session_id = $1", session_id,
        )
    if not row or row["revoked_at"] is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session has been revoked")


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
    await _check_session_active(payload.get("sid"))
    return await _load_user(int(payload["sub"]))


async def get_current_user_optional(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict | None:
    if not credentials:
        return None
    try:
        payload = decode_access_token(credentials.credentials)
        await _check_session_active(payload.get("sid"))
        return await _load_user(int(payload["sub"]))
    except HTTPException:
        return None


async def get_current_session_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )
    payload = decode_access_token(credentials.credentials)
    session_id = payload.get("sid")
    await _check_session_active(session_id)
    return session_id
