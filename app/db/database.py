import asyncpg
import logging
from contextlib import asynccontextmanager
from app.config import settings

logger = logging.getLogger(__name__)

pool: asyncpg.Pool | None = None

_SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
    tracent_id       TEXT PRIMARY KEY,
    source           TEXT NOT NULL,
    source_id        TEXT NOT NULL,
    owner_address    TEXT,
    name             TEXT,
    description      TEXT,
    image_url        TEXT,
    metadata_uri     TEXT,
    is_active        BOOLEAN DEFAULT TRUE,
    x402_support     BOOLEAN DEFAULT FALSE,
    a2a_endpoint     TEXT,
    mcp_endpoint     TEXT,
    web_endpoint     TEXT,
    endpoints_live   BOOLEAN,
    provider_org     TEXT,
    provider_url     TEXT,
    verified         BOOLEAN DEFAULT FALSE,
    trust_tier       TEXT DEFAULT NULL,
    verified_at      TIMESTAMPTZ,
    risk_score       FLOAT DEFAULT 0.0,
    safe_to_transact BOOLEAN DEFAULT FALSE,
    registered_block INTEGER,
    registered_tx    TEXT,
    updated_at       BIGINT,
    first_seen       TIMESTAMPTZ DEFAULT NOW(),
    last_indexed     TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source, source_id)
);

CREATE TABLE IF NOT EXISTS agent_skills (
    id           SERIAL PRIMARY KEY,
    tracent_id   TEXT NOT NULL REFERENCES agents(tracent_id),
    skill_id     TEXT,
    skill_name   TEXT,
    description  TEXT,
    tags         TEXT
);

CREATE TABLE IF NOT EXISTS transfer_events (
    id            SERIAL PRIMARY KEY,
    tracent_id    TEXT NOT NULL REFERENCES agents(tracent_id),
    source        TEXT NOT NULL,
    from_address  TEXT NOT NULL,
    to_address    TEXT NOT NULL,
    block_number  INTEGER,
    tx_hash       TEXT,
    is_mint       BOOLEAN NOT NULL,
    transfer_type TEXT,
    indexed_at    TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tx_hash, tracent_id)
);

CREATE TABLE IF NOT EXISTS reputation_flags (
    id          SERIAL PRIMARY KEY,
    tracent_id  TEXT NOT NULL REFERENCES agents(tracent_id),
    flag_type   TEXT NOT NULL,
    severity    TEXT NOT NULL,
    detail      TEXT,
    flagged_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_requests (
    id              SERIAL PRIMARY KEY,
    tracent_id      TEXT NOT NULL REFERENCES agents(tracent_id),
    requester_email TEXT NOT NULL,
    status          TEXT DEFAULT 'pending',
    reviewer_note   TEXT,
    submitted_at    TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at     TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS index_state (
    source               TEXT PRIMARY KEY,
    last_indexed_block   INTEGER,
    updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_source     ON agents(source);
CREATE INDEX IF NOT EXISTS idx_agents_owner      ON agents(owner_address);
CREATE INDEX IF NOT EXISTS idx_agents_verified   ON agents(verified);
CREATE INDEX IF NOT EXISTS idx_agents_trust_tier ON agents(trust_tier);
CREATE INDEX IF NOT EXISTS idx_agents_risk       ON agents(risk_score);
CREATE INDEX IF NOT EXISTS idx_transfers_tracent ON transfer_events(tracent_id);
CREATE INDEX IF NOT EXISTS idx_flags_tracent     ON reputation_flags(tracent_id);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS domain TEXT;
CREATE INDEX IF NOT EXISTS idx_agents_domain ON agents(domain);

CREATE TABLE IF NOT EXISTS ard_domains (
    domain       TEXT PRIMARY KEY,
    added_at     TIMESTAMPTZ DEFAULT NOW(),
    last_crawled TIMESTAMPTZ,
    agent_count  INTEGER DEFAULT 0,
    active       BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS users (
    id                  SERIAL PRIMARY KEY,
    email               TEXT UNIQUE NOT NULL,
    password_hash       TEXT NOT NULL,
    account_type        TEXT NOT NULL DEFAULT 'individual',
    name                TEXT,
    company_name        TEXT,
    experience_level    TEXT,
    use_case            TEXT,
    purposes            TEXT[],
    bio                 TEXT,
    github_username     TEXT,
    x_handle            TEXT,
    linkedin_handle     TEXT,
    website_url         TEXT,
    huggingface_handle  TEXT,
    other_link          TEXT,
    email_verified      BOOLEAN DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS email_otps (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    code_hash   TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    attempts    INTEGER DEFAULT 0,
    consumed    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);

CREATE TABLE IF NOT EXISTS github_repo_cache (
    user_id         INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    github_username TEXT,
    languages       TEXT[],
    detected_libs   TEXT[],
    repo_count      INTEGER,
    fetched_at      TIMESTAMPTZ,
    rate_limited    BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS huggingface_profiles (
    username        TEXT PRIMARY KEY,
    profile_type    TEXT NOT NULL,
    display_name    TEXT,
    avatar_url      TEXT,
    bio             TEXT,
    is_pro          BOOLEAN DEFAULT FALSE,
    is_verified     BOOLEAN DEFAULT FALSE,
    num_models      INTEGER,
    num_datasets    INTEGER,
    num_spaces      INTEGER,
    num_followers   INTEGER,
    first_seen      TIMESTAMPTZ DEFAULT NOW(),
    last_updated    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hf_profiles_type ON huggingface_profiles(profile_type);
ALTER TABLE huggingface_profiles ADD COLUMN IF NOT EXISTS detected_libs TEXT[];
ALTER TABLE huggingface_profiles ADD COLUMN IF NOT EXISTS agent_count INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS github_profiles (
    username        TEXT PRIMARY KEY,
    profile_type    TEXT NOT NULL,
    display_name    TEXT,
    avatar_url      TEXT,
    bio             TEXT,
    company         TEXT,
    location        TEXT,
    blog_url        TEXT,
    twitter_handle  TEXT,
    public_repos    INTEGER,
    followers       INTEGER,
    following       INTEGER,
    detected_languages TEXT[],
    detected_libs   TEXT[],
    repos_analyzed  INTEGER,
    rate_limited    BOOLEAN DEFAULT FALSE,
    first_seen      TIMESTAMPTZ DEFAULT NOW(),
    last_updated    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gh_profiles_type ON github_profiles(profile_type);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS readme_text TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS readme_fetched_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS agent_deployment_guides (
    id                SERIAL PRIMARY KEY,
    tracent_id        TEXT NOT NULL REFERENCES agents(tracent_id),
    experience_level  TEXT NOT NULL,
    instructions      TEXT NOT NULL,
    readme_fetched_at TIMESTAMPTZ,
    generated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tracent_id, experience_level)
);

-- Self-submitted listings (source = 'tracent'), created via the Contribute page.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS submitted_by INTEGER REFERENCES users(id);
ALTER TABLE agents ADD COLUMN IF NOT EXISTS license TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS deployment_types TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS access_model TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS pricing_model TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS interaction_types TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS sdk_compat TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS industry_tags TEXT[];
ALTER TABLE agents ADD COLUMN IF NOT EXISTS support_channel TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS terms_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS contact_email TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS github_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS huggingface_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS ard_ref TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS producthunt_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS erc8004_ref TEXT;
CREATE INDEX IF NOT EXISTS idx_agents_submitted_by ON agents(submitted_by);

-- Per-source enrichment sentinels: distinct from the data fields they
-- populate so a failed/rate-limited fetch never gets mistaken for "done" and
-- silently skipped on every future backfill pass (only set once a real fetch
-- for that agent actually succeeded).
ALTER TABLE agents ADD COLUMN IF NOT EXISTS github_enriched_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS hf_enriched_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS npm_enriched_at TIMESTAMPTZ;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS futurepedia_enriched_at TIMESTAMPTZ;

-- "Screenshot or demo" field on the Contribute (self-listing) form.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS demo_url TEXT;
CREATE INDEX IF NOT EXISTS idx_agents_github_enriched ON agents(github_enriched_at) WHERE source = 'github';
CREATE INDEX IF NOT EXISTS idx_agents_hf_enriched ON agents(hf_enriched_at) WHERE source = 'huggingface';
CREATE INDEX IF NOT EXISTS idx_agents_npm_enriched ON agents(npm_enriched_at) WHERE source = 'npm';
CREATE INDEX IF NOT EXISTS idx_agents_futurepedia_enriched ON agents(futurepedia_enriched_at) WHERE source = 'futurepedia';

-- Account settings (Settings page: Profile/Notifications/Privacy tabs). The
-- Security tab (2FA, sessions, recovery codes) is intentionally not backed
-- here — that needs real session/TOTP infrastructure the JWT-only auth
-- system doesn't have, so it's a UI-only placeholder for now.
ALTER TABLE users ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS show_follower_count BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_new_follower BOOLEAN DEFAULT TRUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_agent_review BOOLEAN DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed    BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_user ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS agent_favorites (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tracent_id  TEXT NOT NULL REFERENCES agents(tracent_id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, tracent_id)
);

-- Following a person (followed_user_id) or a company/provider org
-- (source + followed_org) are mutually exclusive; exactly one pair is set.
CREATE TABLE IF NOT EXISTS follows (
    id               SERIAL PRIMARY KEY,
    follower_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followed_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    followed_org     TEXT,
    org_source       TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    CHECK (
        (followed_user_id IS NOT NULL AND followed_org IS NULL AND org_source IS NULL)
        OR (followed_user_id IS NULL AND followed_org IS NOT NULL AND org_source IS NOT NULL)
    )
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_user_unique
    ON follows(follower_id, followed_user_id) WHERE followed_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_follows_org_unique
    ON follows(follower_id, org_source, followed_org) WHERE followed_org IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_follows_followed_user ON follows(followed_user_id);
CREATE INDEX IF NOT EXISTS idx_follows_followed_org ON follows(org_source, followed_org);

CREATE TABLE IF NOT EXISTS reviews (
    id          SERIAL PRIMARY KEY,
    tracent_id  TEXT NOT NULL REFERENCES agents(tracent_id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    text        TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tracent_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reviews_tracent_id ON reviews(tracent_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);

CREATE TABLE IF NOT EXISTS contact_messages (
    id          SERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    topic       TEXT,
    message     TEXT NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Server-side session record backing each issued JWT (embedded as the "sid"
-- claim), so a token can be invalidated before its exp by setting revoked_at.
CREATE TABLE IF NOT EXISTS sessions (
    session_id  TEXT PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    issued_at   TIMESTAMPTZ DEFAULT NOW(),
    revoked_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
"""


async def init_db() -> None:
    global pool
    pool = await asyncpg.create_pool(
        settings.DATABASE_URL,
        min_size=2,
        # The startup scrapers/backfills fire off many concurrent DB-touching
        # tasks at once; a small pool here means real user requests can queue
        # behind them indefinitely (pool.acquire() has no default timeout).
        # 20/machine x 2 machines = 40, well under this RDS instance's
        # max_connections=79, leaving headroom for local/admin connections.
        max_size=20,
    )
    async with pool.acquire() as conn:
        await conn.execute(_SCHEMA)
    logger.info("Database initialised")


async def close_db() -> None:
    global pool
    if pool:
        await pool.close()


# If the pool is fully checked out, fail fast with a clear timeout instead of
# hanging a request indefinitely — a request should never silently stall for
# minutes just because background scraping work is holding connections.
_ACQUIRE_TIMEOUT_SECONDS = 10.0


@asynccontextmanager
async def get_conn():
    async with pool.acquire(timeout=_ACQUIRE_TIMEOUT_SECONDS) as conn:
        yield conn


async def cleanup_expired_auth_tokens() -> None:
    async with get_conn() as conn:
        otps_deleted = await conn.execute(
            "DELETE FROM email_otps WHERE expires_at < NOW() - make_interval(days => $1)",
            settings.AUTH_TOKEN_RETENTION_DAYS,
        )
        reset_tokens_deleted = await conn.execute(
            "DELETE FROM password_reset_tokens WHERE expires_at < NOW() - make_interval(days => $1)",
            settings.AUTH_TOKEN_RETENTION_DAYS,
        )
    logger.info(
        "Auth token cleanup: %s, %s",
        otps_deleted, reset_tokens_deleted,
    )
