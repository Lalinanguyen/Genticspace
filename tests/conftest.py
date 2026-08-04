import os

# app.config.Settings() is instantiated at import time, so these must be set
# before anything under app/ is imported (pytest imports this file first).
os.environ.setdefault("ALCHEMY_API_KEY", "test-alchemy-key")
os.environ.setdefault("DATABASE_URL", "postgresql://test:test@localhost/test")
os.environ.setdefault("API_KEY", "test-api-key")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-at-least-32-bytes-long")

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from tests.fake_db import FakeDB, make_fake_get_conn


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    # app.routes.auth.limiter is a module-level singleton whose in-memory
    # storage otherwise persists across every test in the session, so tests
    # reusing the same email (e.g. "a@example.com") trip AUTH_RATE_LIMIT
    # after a handful of unrelated tests rather than testing anything real.
    from app.routes.auth import limiter

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def fake_db():
    return FakeDB()


@pytest.fixture
def sent_emails():
    return {"otp": [], "reset": []}


@pytest.fixture
def client(fake_db, sent_emails, monkeypatch):
    from app.db import jwt_auth as jwt_auth_module
    from app.routes import auth as auth_module

    fake_get_conn = make_fake_get_conn(fake_db)
    monkeypatch.setattr(auth_module, "get_conn", fake_get_conn)
    monkeypatch.setattr(jwt_auth_module, "get_conn", fake_get_conn)

    monkeypatch.setattr(
        auth_module, "send_otp_email",
        lambda email, code: sent_emails["otp"].append((email, code)),
    )
    monkeypatch.setattr(
        auth_module, "send_password_reset_email",
        lambda email, link: sent_emails["reset"].append((email, link)),
    )

    app = FastAPI()
    app.include_router(auth_module.router)
    with TestClient(app) as test_client:
        yield test_client
