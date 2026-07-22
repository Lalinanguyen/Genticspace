"""
One-off script: register the "hello-world" Tracent-hosted agent proof of
concept into the `agents` table.

This is the registration half of the hosting proof-of-concept described in
docs/hosting-architecture.md (ported from the Info-gen design-spike branch;
same schema-facing behavior, adapted only where deslop's actual `agents`
table differs cosmetically from the spike's). It's modeled on the upsert
pattern Info-gen's scripts/seed_demo_agents.py used (same ON CONFLICT
(source, source_id) upsert key, same tracent_id generation as
app/services/indexer.py's `_generate_tracent_id`); deslop doesn't currently
have an equivalent seed-data script of its own. Unlike demo seed data, this
row is meant to describe a real (if locally-simulated) running agent, so:

  - source            = 'tracent-hosted'  (new source value — nothing else
                         in the indexer writes this; it marks "Tracent runs
                         this process itself" as opposed to "this endpoint
                         lives somewhere else that Tracent only tracks")
  - source_id         = 'hello-world'     (the agent's slug — see
                         agents/hello-world/tracent.yaml)
  - mcp_endpoint / web_endpoint point at wherever the agent is actually
    reachable. By default that's http://127.0.0.1:8090 — the local
    simulation started by `python -m scripts.run_hello_world_agent`. This
    is intentionally a localhost URL: there is no real hosting deployment
    yet (see docs/hosting-architecture.md, "Open questions"). Pass
    --mcp-endpoint/--web-endpoint to point at a real deployment once one
    exists.

Only the columns that exist in both the design-spike schema and deslop's
current, much wider `agents` table (app/db/database.py) are written here:
tracent_id, source, source_id, name, description, is_active, x402_support,
mcp_endpoint, web_endpoint, endpoints_live, provider_org, verified,
trust_tier, verified_at, risk_score, safe_to_transact, last_indexed.
deslop-only columns added by the backend integration pass (submitted_by,
license, industry_tags, moderation_status, etc.) are intentionally left at
their schema defaults (NULL, or 'approved' for moderation_status, which is
correct here — this row isn't going through the new anonymous-submission
moderation flow at all).

Usage:
    # 1. Start the agent (separate terminal / background process):
    python -m scripts.run_hello_world_agent --port 8090

    # 2. Register it (this script):
    python -m scripts.register_hosted_agent

    # 3. Verify (with the Tracent backend running separately):
    curl -H "X-API-Key: $API_KEY" http://localhost:8000/agents/trc_<id-printed-below>

Safe to re-run: upserted by (source, source_id), same as Info-gen's
seed_demo_agents.py pattern.

Cleanup:
    DELETE FROM agents WHERE source = 'tracent-hosted' AND source_id = 'hello-world';
"""
import argparse
import asyncio
import secrets
from datetime import datetime, timezone

from app.db.database import close_db, get_conn, init_db

_NOW = datetime.now(timezone.utc)


def _generate_tracent_id() -> str:
    # Mirrors app/services/indexer.py's _generate_tracent_id exactly, so
    # Tracent-hosted agents get IDs indistinguishable in shape from
    # externally-discovered ones.
    suffix = secrets.token_urlsafe(10)[:10]
    return f"trc_{suffix}"


# trust_tier: uses the dedicated 'tracent-hosted' value — distinct from
# 'onchain' (implies ERC-8004 registration; this agent has none: no
# owner_address, no registered_block/tx) and 'tracent' (paid human review of
# a THIRD-PARTY agent — conflating a self-hosted first-party agent with that
# would misrepresent it as having gone through the paid review flow it never
# did). See app/services/trust_summary.py's "tracent_hosted" label and
# docs/hosting-architecture.md's "Open questions" entry. Matching the
# existing convention for non-auto-verified rows, safe_to_transact stays
# FALSE since that flag is documented as auto-verification-only.
#
# Only columns present in deslop's actual `agents` table are referenced
# below (verified against app/db/database.py's _SCHEMA) — every column this
# INSERT touches exists there unchanged from the design-spike schema.
_UPSERT_SQL = """
INSERT INTO agents (
    tracent_id, source, source_id,
    name, description,
    is_active, x402_support,
    mcp_endpoint, web_endpoint, endpoints_live,
    provider_org,
    verified, trust_tier, verified_at,
    risk_score, safe_to_transact,
    last_indexed
) VALUES (
    $1, $2, $3,
    $4, $5,
    TRUE, FALSE,
    $6, $7, TRUE,
    $8,
    TRUE, 'tracent-hosted', $9,
    0.0, FALSE,
    NOW()
)
ON CONFLICT (source, source_id) DO UPDATE SET
    tracent_id       = agents.tracent_id,
    name             = EXCLUDED.name,
    description      = EXCLUDED.description,
    mcp_endpoint     = EXCLUDED.mcp_endpoint,
    web_endpoint     = EXCLUDED.web_endpoint,
    endpoints_live   = EXCLUDED.endpoints_live,
    provider_org     = EXCLUDED.provider_org,
    verified         = EXCLUDED.verified,
    trust_tier       = EXCLUDED.trust_tier,
    verified_at      = EXCLUDED.verified_at,
    risk_score       = EXCLUDED.risk_score,
    safe_to_transact = EXCLUDED.safe_to_transact,
    last_indexed     = NOW()
RETURNING tracent_id
"""


async def register(mcp_endpoint: str, web_endpoint: str) -> str:
    await init_db()
    try:
        async with get_conn() as conn:
            tracent_id_for_insert = _generate_tracent_id()
            row = await conn.fetchrow(
                _UPSERT_SQL,
                tracent_id_for_insert,
                "tracent-hosted",
                "hello-world",
                "Tracent Hello World",
                "Hard-coded echo agent — proof of concept for Tracent's first-party agent hosting.",
                mcp_endpoint,
                web_endpoint,
                "Tracent",
                _NOW,
            )
            tracent_id = row["tracent_id"]

            await conn.execute("DELETE FROM agent_skills WHERE tracent_id = $1", tracent_id)
            await conn.execute(
                """
                INSERT INTO agent_skills (tracent_id, skill_id, skill_name, description, tags)
                VALUES ($1, $2, $3, $4, $5)
                """,
                tracent_id, "echo", "Echo",
                "Echoes back whatever text you send it.", '["demo", "utility"]',
            )
        return tracent_id
    finally:
        await close_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--mcp-endpoint", default="http://127.0.0.1:8090/mcp",
        help="Where the hello-world agent's MCP interface is actually reachable. "
             "Defaults to the local-simulation address (see run_hello_world_agent.py).",
    )
    parser.add_argument(
        "--web-endpoint", default="http://127.0.0.1:8090",
        help="Where the hello-world agent's landing page is actually reachable.",
    )
    args = parser.parse_args()

    tracent_id = asyncio.run(register(args.mcp_endpoint, args.web_endpoint))
    print(f"Registered hello-world hosted agent as {tracent_id} (source=tracent-hosted)")
    print(f"  mcp_endpoint = {args.mcp_endpoint}")
    print(f"  web_endpoint = {args.web_endpoint}")
    print(f"Verify: curl -H \"X-API-Key: $API_KEY\" http://localhost:8000/agents/{tracent_id}")
