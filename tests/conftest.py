"""
Shared pytest fixtures for deslop's test suite.

Spins up a disposable Postgres database (a sibling of whatever DATABASE_URL
in .env points at, suffixed `_test`) on the same Postgres server already
configured for local dev, and runs app.db.database.init_db()'s *real* schema
creation against it. Nothing about the DB layer is mocked: every test in
this suite exercises the actual SQL in app/routes/*.py and
app/services/*.py against a real Postgres, then the database (and
everything in it) is recreated fresh for the next test session and dropped
at the end.

See docs/testing.md for how to run this locally.
"""
import os
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

import asyncpg
import pytest
import pytest_asyncio
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env")

_BASE_DATABASE_URL = os.environ.get("DATABASE_URL")
if not _BASE_DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Copy .env.example to .env and point it at a "
        "reachable local Postgres server before running the test suite — "
        "see docs/testing.md."
    )

_parts = urlsplit(_BASE_DATABASE_URL)
_base_db_name = _parts.path.lstrip("/") or "tracent"
TEST_DB_NAME = f"{_base_db_name}_test"
MAINTENANCE_DATABASE_URL = urlunsplit((_parts.scheme, _parts.netloc, "/postgres", "", ""))
TEST_DATABASE_URL = urlunsplit((_parts.scheme, _parts.netloc, f"/{TEST_DB_NAME}", "", ""))

# This reassignment MUST happen before the first `import app...` anywhere in
# the test session. conftest.py is always imported by pytest before any test
# module is collected, so as long as no other test file imports app.config
# (or anything that imports it) before this module runs, app.config.Settings()
# below picks up the disposable test database instead of the real dev one.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("ALCHEMY_API_KEY", "test-dummy-alchemy-key")
os.environ.setdefault("API_KEY", "test-master-key-do-not-use-in-prod")
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-do-not-use-in-prod")
# Real values are never required for import or for anything this suite
# exercises — Settings declares these Optional[str] = None, and app.main's
# lifespan (the only place that would actually call out to GitHub/Anthropic)
# is deliberately never invoked by the `client` fixture below. Explicitly
# absent (not dummy) here to also serve as a standing check that import
# doesn't secretly require them.
os.environ.pop("ANTHROPIC_API_KEY", None)
os.environ.pop("GITHUB_TOKEN", None)
os.environ.pop("HUGGINGFACE_TOKEN", None)

from app.config import settings  # noqa: E402  (must follow the env overrides above)
from app.db import database as db_module  # noqa: E402
from app.db.jwt_auth import create_access_token  # noqa: E402
from app.main import app  # noqa: E402
from app.rate_limit import limiter  # noqa: E402

# Every table init_db() creates. Truncated (not dropped) between tests so we
# don't pay schema-creation cost per test while still guaranteeing isolation.
# Listed explicitly (rather than relying on CASCADE-only reachability from a
# smaller "root" set) so tables with no FK into agents/users (api_keys,
# email_otps, contact_messages, index_state, ard_domains, the scraper
# profile-cache tables) are also reliably cleared every test.
TABLES = (
    "agents", "agent_skills", "transfer_events", "reputation_flags",
    "verification_requests", "index_state", "ard_domains",
    "users", "email_otps", "github_repo_cache", "huggingface_profiles",
    "github_profiles", "agent_deployment_guides", "password_reset_tokens",
    "agent_favorites", "follows", "reviews", "contact_messages", "api_keys",
)


async def _run_on_maintenance_db(sql: str) -> None:
    conn = await asyncpg.connect(dsn=MAINTENANCE_DATABASE_URL)
    try:
        await conn.execute(sql)
    finally:
        await conn.close()


@pytest_asyncio.fixture(scope="session", loop_scope="session", autouse=True)
async def _test_database():
    """
    Session-scoped, autouse: (re)create a fresh `<db>_test` database, run
    init_db()'s real CREATE TABLE / ALTER TABLE schema against it, yield for
    the whole test session, then close the pool and drop the database.

    `WITH (FORCE)` (Postgres 13+) drops the database even if a stale
    connection from a previous, uncleanly-terminated test run is still
    attached to it.
    """
    await _run_on_maintenance_db(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)')
    await _run_on_maintenance_db(f'CREATE DATABASE "{TEST_DB_NAME}"')

    await db_module.init_db()
    yield
    await db_module.close_db()

    await _run_on_maintenance_db(f'DROP DATABASE IF EXISTS "{TEST_DB_NAME}" WITH (FORCE)')


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def client(_test_database):
    """
    httpx.AsyncClient wired directly to the real FastAPI app via ASGITransport.

    Deliberately does NOT go through app.main's `lifespan` (which would kick
    off real on-chain indexing / ARD crawling / ~15 scrapers and an
    APScheduler hitting the network) — the test DB pool is already managed
    by `_test_database` above, and ASGITransport never sends lifespan
    startup/shutdown events unless asked to, so none of that background
    machinery ever starts during tests.
    """
    from httpx import ASGITransport, AsyncClient

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as ac:
        yield ac


@pytest_asyncio.fixture(autouse=True, loop_scope="session")
async def _clean_state():
    """
    Function-scoped, autouse: truncate every table and reset slowapi's
    in-memory rate-limit counters before each test. Without this, tests
    would leak data and rate-limit hits into one another depending on
    execution order.
    """
    async with db_module.get_conn() as conn:
        await conn.execute(f"TRUNCATE {', '.join(TABLES)} RESTART IDENTITY CASCADE")
    limiter.reset()
    yield


@pytest.fixture
def master_key_headers() -> dict:
    return {"X-API-Key": settings.API_KEY}


@pytest_asyncio.fixture
async def jwt_user(_clean_state):
    """
    Inserts a real row into `users` directly (bypassing the signup/OTP
    flow, per docs/testing.md — signup requires a mailer round trip this
    suite doesn't need to exercise) and mints a real JWT for it via
    app.db.jwt_auth.create_access_token, the same function
    POST /auth/signup and POST /auth/login use. This is not a mock: the
    resulting token is verified by the real get_current_user dependency
    exactly as it would be for a token issued through the HTTP signup flow.

    Returns (user_id, email, auth_headers).
    """
    email = "jwt-test-user@example.com"
    async with db_module.get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO users (email, password_hash, account_type, email_verified)
            VALUES ($1, 'not-a-real-bcrypt-hash', 'individual', TRUE)
            RETURNING id
            """,
            email,
        )
    user_id = row["id"]
    token = create_access_token(user_id, email)
    return user_id, email, {"Authorization": f"Bearer {token}"}
