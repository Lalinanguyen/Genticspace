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
"""


async def init_db() -> None:
    global pool
    pool = await asyncpg.create_pool(
        settings.DATABASE_URL,
        min_size=2,
        max_size=10,
    )
    async with pool.acquire() as conn:
        await conn.execute(_SCHEMA)
    logger.info("Database initialised")


async def close_db() -> None:
    global pool
    if pool:
        await pool.close()


@asynccontextmanager
async def get_conn():
    async with pool.acquire() as conn:
        yield conn
