import asyncpg
import logging
from contextlib import asynccontextmanager
from app.config import settings

logger = logging.getLogger(__name__)

pool: asyncpg.Pool | None = None

# Guards against a genticspace_id-named schema, ported from the `deslop`
# branch's app/db/database.py (see that branch's history: e362746 renamed
# tracent_id -> genticspace_id, 1508e92 reverted it, 023b6e5 fixed a
# fresh-database crash in the revert). This branch (`main`) never carried
# either migration — it predates that whole rename saga and every _SCHEMA
# statement below has always said `tracent_id` directly. This guard is
# purely defensive: it only matters if this branch's backend is ever
# deployed against a database that was last touched by `deslop`'s backend
# mid-rename (i.e. still has genticspace_id) or that drifts back to it by
# some other means. As of 2026-07-27 the live production database already
# reads back tracent_id (verified via the public API), so this is a no-op
# on the actual current database — added purely so this branch is no
# longer the one copy of the schema with zero protection if that ever
# changes. Guarded on IF EXISTS so it's a no-op on a fresh database too
# (created with tracent_id directly by _SCHEMA, which hasn't run yet the
# first time this executes).
_RENAME_GENTICSPACE_TO_TRACENT = """
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='genticspace_id') THEN
    ALTER TABLE agents RENAME COLUMN genticspace_id TO tracent_id;
    ALTER TABLE agent_skills RENAME COLUMN genticspace_id TO tracent_id;
    ALTER TABLE transfer_events RENAME COLUMN genticspace_id TO tracent_id;
    ALTER TABLE reputation_flags RENAME COLUMN genticspace_id TO tracent_id;
    ALTER TABLE verification_requests RENAME COLUMN genticspace_id TO tracent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_deployment_guides' AND column_name='genticspace_id') THEN
    ALTER TABLE agent_deployment_guides RENAME COLUMN genticspace_id TO tracent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='agent_favorites' AND column_name='genticspace_id') THEN
    ALTER TABLE agent_favorites RENAME COLUMN genticspace_id TO tracent_id;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='reviews' AND column_name='genticspace_id') THEN
    ALTER TABLE reviews RENAME COLUMN genticspace_id TO tracent_id;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='agents') THEN
    UPDATE agents SET trust_tier = 'tracent' WHERE trust_tier = 'genticspace';
    UPDATE agents SET trust_tier = 'tracent-hosted' WHERE trust_tier = 'genticspace-hosted';
    UPDATE agents SET source = 'tracent' WHERE source = 'genticspace';
    UPDATE agents SET source = 'tracent-hosted' WHERE source = 'genticspace-hosted';
  END IF;
END $$;
"""


async def _migrate_genticspace_to_tracent(conn: asyncpg.Connection) -> None:
    async with conn.transaction():
        agents_table_existed = await conn.fetchval(
            "SELECT 1 FROM information_schema.tables WHERE table_name='agents'"
        )
        await conn.execute(_RENAME_GENTICSPACE_TO_TRACENT)
        renamed = await conn.fetchval(
            "SELECT 1 FROM information_schema.columns WHERE table_name='agents' AND column_name='tracent_id'"
        )
        if agents_table_existed and not renamed:
            raise RuntimeError(
                "genticspace_id -> tracent_id migration did not take effect: "
                "agents.tracent_id still doesn't exist after running the rename"
            )
    logger.info("Schema migration check: agents.tracent_id present")


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
-- Distinguishes a real generated guide from a cached "no source material yet"
-- placeholder, so the placeholder can itself be cached (instead of
-- re-fetching the agent's website on every single view/backfill pass) without
-- the API reporting has_readme=true for an agent with nothing real to show.
ALTER TABLE agent_deployment_guides ADD COLUMN IF NOT EXISTS has_material BOOLEAN DEFAULT TRUE;

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

-- Durable "last successful run" record for scheduled background jobs, kept
-- in the DB rather than APScheduler's in-memory timer: this app redeploys
-- roughly every few hours, which reset the in-memory interval countdown on
-- every restart and kept multi-hour-interval backfills (GitHub enrichment,
-- README scraping, etc.) from ever reaching a first successful full pass.
CREATE TABLE IF NOT EXISTS job_runs (
    job_id           TEXT PRIMARY KEY,
    last_started_at  TIMESTAMPTZ,
    last_finished_at TIMESTAMPTZ
);

-- Sandbox mode: lets a user run an agent's actual open-source repo in an
-- isolated Fly Machine. sandbox_enabled only ever becomes true once a valid
-- genticspace.yaml manifest (build/run commands) has been found in the agent's
-- repo -- there is no admin allowlist, but there is also no attempt to guess
-- build steps for repos that don't declare them.
CREATE TABLE IF NOT EXISTS agent_sandbox_config (
    tracent_id          TEXT PRIMARY KEY REFERENCES agents(tracent_id),
    sandbox_enabled     BOOLEAN DEFAULT FALSE,
    runtime             TEXT,
    source_ref          TEXT,
    build_command       TEXT,
    run_command         TEXT,
    entrypoint          TEXT,
    default_port        INTEGER,
    manifest_path       TEXT,
    manifest_fetched_at TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_sandbox_runs (
    id             SERIAL PRIMARY KEY,
    tracent_id     TEXT NOT NULL REFERENCES agents(tracent_id),
    user_id        INTEGER NOT NULL REFERENCES users(id),
    status         TEXT NOT NULL DEFAULT 'queued',
    fly_machine_id TEXT,
    ingest_token   TEXT NOT NULL,
    exit_code      INTEGER,
    logs           TEXT DEFAULT '',
    log_bytes      INTEGER DEFAULT 0,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    started_at     TIMESTAMPTZ,
    finished_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_sandbox_runs_user   ON agent_sandbox_runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sandbox_runs_active ON agent_sandbox_runs(status)
    WHERE status IN ('queued', 'provisioning', 'running');

-- Per-client API keys (see app/db/auth.py). Only a sha256 hash of the raw
-- key is ever stored; the raw key is returned once, at mint time, by
-- POST /admin/api-keys and never persisted or logged. `scope` determines
-- which master key (ADMIN_API_KEY vs PARTNER_API_KEY) this row stands in for.
CREATE TABLE IF NOT EXISTS api_keys (
    id           SERIAL PRIMARY KEY,
    key_hash     TEXT NOT NULL UNIQUE,
    owner_email  TEXT NOT NULL,
    label        TEXT,
    scope        TEXT NOT NULL DEFAULT 'partner',
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    revoked_at   TIMESTAMPTZ
);

-- Traceability for every mutating /admin/* action (see app/routes/admin.py's
-- log_admin_action). `actor` is the identity string verify_admin_key returns
-- (a master-key sentinel or a per-client key's owner_email), not the raw key.
CREATE TABLE IF NOT EXISTS admin_actions (
    id          SERIAL PRIMARY KEY,
    actor       TEXT NOT NULL,
    action      TEXT NOT NULL,
    target      TEXT,
    detail      TEXT,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON admin_actions(target);

-- Sandbox-mode admission record: a small, manually hand-picked cohort of
-- agents eligible for (future) sandboxed trial-runs. This table does NOT
-- mean anything actually executes -- it's the gate an admin can flip, most
-- notably to force `status = 'disabled'` as a kill switch (see
-- POST /admin/sandbox/{tracent_id}/disable in app/routes/admin.py).
CREATE TABLE IF NOT EXISTS sandbox_cohort (
    tracent_id      TEXT NOT NULL REFERENCES agents(tracent_id),
    admitted_at     TIMESTAMPTZ DEFAULT NOW(),
    admitted_by     TEXT NOT NULL,
    manifest_path   TEXT,
    status          TEXT NOT NULL DEFAULT 'pending_security_review',
    PRIMARY KEY (tracent_id)
);
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
        await _migrate_genticspace_to_tracent(conn)
        await conn.execute(_SCHEMA)
    logger.info("Database initialised")


async def close_db() -> None:
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
