import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr

from app.config import settings
from app.db.database import get_conn
from app.db.jwt_auth import create_access_token, get_current_user
from app.services.mailer import send_otp_email, send_password_reset_email

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_OTP_TTL_MINUTES = 10
_EMAIL_TOKEN_TTL_MINUTES = 15
_EMAIL_TOKEN_PURPOSE = "email_verified"
_RESET_TOKEN_TTL_MINUTES = 30


def _hash_code(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


class RequestOtpBody(BaseModel):
    email: EmailStr


class VerifyOtpBody(BaseModel):
    email: EmailStr
    code: str


class ConnectAccounts(BaseModel):
    github: str | None = None
    x: str | None = None
    linkedin: str | None = None
    website: str | None = None
    huggingface: str | None = None
    other: str | None = None


class SignupBody(BaseModel):
    email: EmailStr
    email_verified_token: str
    password: str
    account_type: str = "individual"
    name: str | None = None
    company_name: str | None = None
    experience_level: str | None = None
    use_case: str | None = None
    purposes: list[str] | None = None
    bio: str | None = None
    connects: ConnectAccounts | None = None


class LoginBody(BaseModel):
    email: EmailStr
    password: str


def _user_response(row) -> dict:
    d = dict(row)
    d.pop("password_hash", None)
    return d


@router.post("/request-otp")
async def request_otp(body: RequestOtpBody):
    code = f"{secrets.randbelow(1_000_000):06d}"
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=_OTP_TTL_MINUTES)

    async with get_conn() as conn:
        await conn.execute(
            "INSERT INTO email_otps (email, code_hash, expires_at) VALUES ($1, $2, $3)",
            body.email, _hash_code(code), expires_at,
        )

    send_otp_email(body.email, code)
    return {"status": "sent"}


@router.post("/verify-otp")
async def verify_otp(body: VerifyOtpBody):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, attempts FROM email_otps
            WHERE email = $1 AND consumed = FALSE AND expires_at > NOW()
            ORDER BY created_at DESC LIMIT 1
            """,
            body.email,
        )
        if not row:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "No active verification code for this email")
        if row["attempts"] >= 5:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many attempts, request a new code")

        expected = await conn.fetchval("SELECT code_hash FROM email_otps WHERE id = $1", row["id"])
        if expected != _hash_code(body.code):
            await conn.execute("UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1", row["id"])
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect code")

        await conn.execute("UPDATE email_otps SET consumed = TRUE WHERE id = $1", row["id"])

    token = jwt.encode(
        {
            "email": body.email,
            "purpose": _EMAIL_TOKEN_PURPOSE,
            "exp": datetime.now(timezone.utc) + timedelta(minutes=_EMAIL_TOKEN_TTL_MINUTES),
        },
        settings.JWT_SECRET,
        algorithm="HS256",
    )
    return {"email_verified_token": token}


def _decode_email_token(token: str, email: str) -> None:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired verification token") from exc
    if payload.get("purpose") != _EMAIL_TOKEN_PURPOSE or payload.get("email") != email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Verification token does not match this email")


@router.post("/signup")
async def signup(body: SignupBody):
    _decode_email_token(body.email_verified_token, body.email)

    password_hash = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    connects = body.connects or ConnectAccounts()

    async with get_conn() as conn:
        existing = await conn.fetchval("SELECT id FROM users WHERE email = $1", body.email)
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

        row = await conn.fetchrow(
            """
            INSERT INTO users (
                email, password_hash, account_type, name, company_name, experience_level,
                use_case, purposes, bio, github_username, x_handle, linkedin_handle,
                website_url, huggingface_handle, other_link, email_verified
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE)
            RETURNING id, email, account_type, name, company_name, experience_level,
                      use_case, purposes, bio, github_username, x_handle, linkedin_handle,
                      website_url, huggingface_handle, other_link, email_verified, created_at
            """,
            body.email, password_hash, body.account_type, body.name, body.company_name,
            body.experience_level, body.use_case, body.purposes, body.bio,
            connects.github, connects.x, connects.linkedin, connects.website,
            connects.huggingface, connects.other,
        )

    token = create_access_token(row["id"], row["email"])
    return {"access_token": token, "user": _user_response(row)}


@router.post("/login")
async def login(body: LoginBody):
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", body.email)

    if not row or not bcrypt.checkpw(body.password.encode(), row["password_hash"].encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")

    token = create_access_token(row["id"], row["email"])
    return {"access_token": token, "user": _user_response(row)}


@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return current_user


class ForgotPasswordBody(BaseModel):
    email: EmailStr


class ResetPasswordBody(BaseModel):
    token: str
    new_password: str


@router.post("/forgot-password")
async def forgot_password(body: ForgotPasswordBody):
    async with get_conn() as conn:
        user = await conn.fetchrow("SELECT id FROM users WHERE email = $1", body.email)
        if user:
            token = secrets.token_urlsafe(32)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=_RESET_TOKEN_TTL_MINUTES)
            await conn.execute(
                "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
                user["id"], _hash_code(token), expires_at,
            )
            reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
            send_password_reset_email(body.email, reset_link)

    # Always the same response whether or not the email exists, so this
    # endpoint can't be used to enumerate registered accounts.
    return {"status": "sent"}


@router.post("/reset-password")
async def reset_password(body: ResetPasswordBody):
    if len(body.new_password) < 8:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Password must be at least 8 characters")

    token_hash = _hash_code(body.token)
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, user_id FROM password_reset_tokens
            WHERE token_hash = $1 AND consumed = FALSE AND expires_at > NOW()
            """,
            token_hash,
        )
        if not row:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset link")

        password_hash = bcrypt.hashpw(body.new_password.encode(), bcrypt.gensalt()).decode()
        await conn.execute(
            "UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2",
            password_hash, row["user_id"],
        )
        await conn.execute("UPDATE password_reset_tokens SET consumed = TRUE WHERE id = $1", row["id"])

    return {"status": "reset"}


class UpdateProfileBody(BaseModel):
    name: str | None = None
    company_name: str | None = None
    bio: str | None = None
    industry: str | None = None
    website_url: str | None = None
    experience_level: str | None = None
    purposes: list[str] | None = None
    connects: ConnectAccounts | None = None
    is_private: bool | None = None
    show_follower_count: bool | None = None
    notify_new_follower: bool | None = None
    notify_agent_review: bool | None = None


@router.patch("/me")
async def update_me(body: UpdateProfileBody, current_user: dict = Depends(get_current_user)):
    connects = body.connects
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE users SET
                name = COALESCE($2, name),
                company_name = COALESCE($3, company_name),
                bio = COALESCE($4, bio),
                industry = COALESCE($5, industry),
                website_url = COALESCE($6, website_url),
                experience_level = COALESCE($7, experience_level),
                purposes = COALESCE($8, purposes),
                github_username = COALESCE($9, github_username),
                x_handle = COALESCE($10, x_handle),
                linkedin_handle = COALESCE($11, linkedin_handle),
                huggingface_handle = COALESCE($12, huggingface_handle),
                other_link = COALESCE($13, other_link),
                is_private = COALESCE($14, is_private),
                show_follower_count = COALESCE($15, show_follower_count),
                notify_new_follower = COALESCE($16, notify_new_follower),
                notify_agent_review = COALESCE($17, notify_agent_review),
                updated_at = NOW()
            WHERE id = $1
            RETURNING id, email, account_type, name, company_name, experience_level,
                      use_case, purposes, bio, github_username, x_handle, linkedin_handle,
                      website_url, huggingface_handle, other_link, email_verified, created_at,
                      industry, is_private, show_follower_count, notify_new_follower, notify_agent_review
            """,
            current_user["id"],
            body.name, body.company_name, body.bio, body.industry,
            body.website_url if body.website_url is not None else (connects.website if connects else None),
            body.experience_level, body.purposes,
            connects.github if connects else None,
            connects.x if connects else None,
            connects.linkedin if connects else None,
            connects.huggingface if connects else None,
            connects.other if connects else None,
            body.is_private, body.show_follower_count,
            body.notify_new_follower, body.notify_agent_review,
        )
    return dict(row)
