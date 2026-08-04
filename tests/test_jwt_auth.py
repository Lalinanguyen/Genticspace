import jwt as pyjwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.db import jwt_auth
from tests.fake_db import FakeDB, make_fake_get_conn


def _creds(token: str) -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)


async def test_create_access_token_round_trips_through_decode(monkeypatch):
    monkeypatch.setattr(jwt_auth, "get_conn", make_fake_get_conn(FakeDB()))
    token = await jwt_auth.create_access_token(42, "a@example.com")
    payload = jwt_auth.decode_access_token(token)
    assert payload["sub"] == "42"
    assert payload["email"] == "a@example.com"


async def test_create_access_token_honors_custom_expiry(monkeypatch):
    monkeypatch.setattr(jwt_auth, "get_conn", make_fake_get_conn(FakeDB()))
    token = await jwt_auth.create_access_token(1, "a@example.com", expires_minutes=-1)
    with pytest.raises(HTTPException) as exc_info:
        jwt_auth.decode_access_token(token)
    assert exc_info.value.status_code == 401


def test_decode_access_token_rejects_malformed_tokens():
    with pytest.raises(HTTPException) as exc_info:
        jwt_auth.decode_access_token("not-a-jwt")
    assert exc_info.value.status_code == 401


def test_decode_access_token_rejects_tokens_signed_with_a_different_secret():
    forged = pyjwt.encode({"sub": "1", "email": "a@example.com"}, "a-completely-different-secret", algorithm="HS256")
    with pytest.raises(HTTPException) as exc_info:
        jwt_auth.decode_access_token(forged)
    assert exc_info.value.status_code == 401


def test_decode_access_token_rejects_tokens_with_no_algorithm_pinned_alg_none():
    # A token that claims alg=none must never be accepted, even if unsigned.
    forged = pyjwt.encode({"sub": "1", "email": "a@example.com"}, key=None, algorithm="none")
    with pytest.raises(HTTPException):
        jwt_auth.decode_access_token(forged)


async def test_get_current_user_requires_credentials():
    with pytest.raises(HTTPException) as exc_info:
        await jwt_auth.get_current_user(credentials=None)
    assert exc_info.value.status_code == 401


async def test_get_current_user_loads_the_user_and_strips_password_hash(monkeypatch):
    db = FakeDB()
    db.users.append({
        "id": 1, "email": "a@example.com", "account_type": "individual",
        "name": "Ada", "company_name": None, "experience_level": None, "use_case": None,
        "purposes": None, "bio": None, "github_username": None, "x_handle": None,
        "linkedin_handle": None, "website_url": None, "huggingface_handle": None,
        "other_link": None, "email_verified": True, "created_at": None,
        "industry": None, "is_private": False, "show_follower_count": True,
        "notify_new_follower": True, "notify_agent_review": True,
        "password_hash": "should-never-be-exposed",
    })
    monkeypatch.setattr(jwt_auth, "get_conn", make_fake_get_conn(db))

    token = await jwt_auth.create_access_token(1, "a@example.com")
    user = await jwt_auth.get_current_user(credentials=_creds(token))
    assert user["email"] == "a@example.com"
    assert "password_hash" not in user


async def test_get_current_user_rejects_a_token_for_a_deleted_user(monkeypatch):
    db = FakeDB()  # no users
    monkeypatch.setattr(jwt_auth, "get_conn", make_fake_get_conn(db))

    token = await jwt_auth.create_access_token(999, "ghost@example.com")
    with pytest.raises(HTTPException) as exc_info:
        await jwt_auth.get_current_user(credentials=_creds(token))
    assert exc_info.value.status_code == 401


async def test_get_current_user_optional_returns_none_without_credentials():
    assert await jwt_auth.get_current_user_optional(credentials=None) is None


async def test_get_current_user_optional_swallows_invalid_tokens():
    result = await jwt_auth.get_current_user_optional(credentials=_creds("garbage"))
    assert result is None
