"""
Regression test for a bug already found and fixed during the backend
moderation port: GET /agents?flagged_only=true (and, by extension,
GET /public/agents?flagged_only=true) used to throw a Postgres
"SELECT DISTINCT ... ORDER BY expressions must appear in select list"
(InvalidColumnReferenceError) once the query used SELECT DISTINCT together
with an ORDER BY expression not listed verbatim in the select list.

Per app/services/agent_queries.py's comment on `_no_desc` /
`_HIGH_FLAG_EXISTS`: Postgres requires SELECT DISTINCT's ORDER BY
expressions to appear literally in the select list, not just their
underlying columns — this affects the `flagged_only` branch (pre-existing)
and the `needs_skills_join` branch (new, from wiring `q` into a
skills-joined query) alike, since both use `SELECT DISTINCT`.

This test seeds a flagged agent and hits both routes with
`flagged_only=true` (with and without `q`, so both DISTINCT branches in
query_agents are covered) — if the ORDER BY / SELECT DISTINCT mismatch ever
regresses, asyncpg surfaces the underlying Postgres error as a 500, and
this test fails loudly instead of silently passing.
"""
from app.db import database as db_module
from tests.helpers import insert_agent, insert_flag, insert_skill, unique_id


async def _seed_flagged_agent(conn):
    tracent_id = unique_id()
    await insert_agent(
        conn, tracent_id=tracent_id, name="Flagged Regression Agent",
        description="has a high severity flag", risk_score=9.0,
    )
    await insert_skill(conn, tracent_id=tracent_id, skill_name="risky-skill", tags=["risky-category"])
    await insert_flag(conn, tracent_id=tracent_id, severity="high", flag_type="ownership_transfer")
    return tracent_id


async def test_legacy_flagged_only_does_not_500(client, master_key_headers):
    async with db_module.get_conn() as conn:
        tracent_id = await _seed_flagged_agent(conn)

    resp = await client.get("/agents", params={"flagged_only": "true"}, headers=master_key_headers)
    assert resp.status_code == 200, resp.text
    assert tracent_id in {a["tracent_id"] for a in resp.json()["agents"]}


async def test_public_flagged_only_does_not_500(client):
    async with db_module.get_conn() as conn:
        tracent_id = await _seed_flagged_agent(conn)

    resp = await client.get("/public/agents", params={"flagged_only": "true"})
    assert resp.status_code == 200, resp.text
    assert tracent_id in {a["tracent_id"] for a in resp.json()["agents"]}


async def test_flagged_only_combined_with_q_does_not_500(client, master_key_headers):
    # Exercises BOTH SELECT DISTINCT branches in query_agents at once
    # (flagged_only's JOIN reputation_flags and needs_skills_join's LEFT
    # JOIN agent_skills) — the riskiest combination for an ORDER BY /
    # SELECT DISTINCT column mismatch to resurface in.
    async with db_module.get_conn() as conn:
        tracent_id = await _seed_flagged_agent(conn)

    resp = await client.get(
        "/agents",
        params={"flagged_only": "true", "q": "risky-category"},
        headers=master_key_headers,
    )
    assert resp.status_code == 200, resp.text
    assert tracent_id in {a["tracent_id"] for a in resp.json()["agents"]}

    public_resp = await client.get(
        "/public/agents", params={"flagged_only": "true", "q": "risky-category"}
    )
    assert public_resp.status_code == 200, public_resp.text
    assert tracent_id in {a["tracent_id"] for a in public_resp.json()["agents"]}


async def test_flagged_only_with_severity_filter_on_dedicated_flagged_route_does_not_500(
    client, master_key_headers
):
    # GET /agents/flagged is a separate hand-written SELECT DISTINCT query
    # (app/routes/agents.py's list_flagged) with the same DISTINCT + ORDER
    # BY risk_score shape — covered here too since it's a distinct code path
    # from query_agents's flagged_only branch above.
    async with db_module.get_conn() as conn:
        tracent_id = await _seed_flagged_agent(conn)

    resp = await client.get("/agents/flagged", params={"severity": "high"}, headers=master_key_headers)
    assert resp.status_code == 200, resp.text
    assert tracent_id in {a["tracent_id"] for a in resp.json()["agents"]}
