"""
Tests for GET /agents and GET /public/agents (the `q` search parameter) and
GET /agents/categories / GET /public/agents/categories.

Both listing routes funnel into the same app/services/agent_queries.py
query_agents()/list_skill_categories(), so this suite seeds data once and
exercises it through *both* surfaces to prove they actually behave the same
way, not just that one of them (typically the newer /public/agents) works:

  - GET /agents  is the original, key-gated "partner API" router
    (app/routes/agents.py's `router`).
  - GET /public/agents is the separate, unauthenticated surface the real
    frontend calls (app/routes/public.py).

Case-insensitive substring match across agents.name, agents.description,
and agent_skills.skill_name/tags (see app/services/agent_queries.py's
query_agents `q` branch).
"""
from app.db import database as db_module
from tests.helpers import insert_agent, insert_skill, unique_id


async def _seed_three_distinct_agents(conn):
    """
    Three agents, each matchable through exactly one of the three
    documented searchable fields, using unique tokens so a match can only
    be explained by that one field.
    """
    name_agent = unique_id()
    await insert_agent(conn, genticspace_id=name_agent, name="ZzyxNameMatch Corp",
                        description="a totally unrelated description")

    desc_agent = unique_id()
    await insert_agent(conn, genticspace_id=desc_agent, name="Unrelated Name",
                        description="contains ZzyxDescMatch somewhere in the middle")

    skill_agent = unique_id()
    await insert_agent(conn, genticspace_id=skill_agent, name="Another Unrelated Name",
                        description="another unrelated description")
    await insert_skill(conn, genticspace_id=skill_agent, skill_name="ZzyxSkillNameMatch",
                        description="skill description", tags=["ZzyxTagMatch"])

    return name_agent, desc_agent, skill_agent


# --- GET /public/agents (no auth) -------------------------------------------

async def test_public_search_matches_on_name(client):
    async with db_module.get_conn() as conn:
        name_agent, desc_agent, skill_agent = await _seed_three_distinct_agents(conn)

    resp = await client.get("/public/agents", params={"q": "ZzyxNameMatch"})
    assert resp.status_code == 200
    body = resp.json()
    ids = {a["genticspace_id"] for a in body["agents"]}
    assert ids == {name_agent}
    assert body["total"] == 1


async def test_public_search_matches_on_description(client):
    async with db_module.get_conn() as conn:
        name_agent, desc_agent, skill_agent = await _seed_three_distinct_agents(conn)

    resp = await client.get("/public/agents", params={"q": "ZzyxDescMatch"})
    ids = {a["genticspace_id"] for a in resp.json()["agents"]}
    assert ids == {desc_agent}


async def test_public_search_matches_on_skill_name_and_tags(client):
    async with db_module.get_conn() as conn:
        name_agent, desc_agent, skill_agent = await _seed_three_distinct_agents(conn)

    by_skill_name = await client.get("/public/agents", params={"q": "ZzyxSkillNameMatch"})
    assert {a["genticspace_id"] for a in by_skill_name.json()["agents"]} == {skill_agent}

    by_tag = await client.get("/public/agents", params={"q": "ZzyxTagMatch"})
    assert {a["genticspace_id"] for a in by_tag.json()["agents"]} == {skill_agent}


async def test_public_search_is_case_insensitive_and_excludes_unrelated(client):
    async with db_module.get_conn() as conn:
        name_agent, _, _ = await _seed_three_distinct_agents(conn)

    resp = await client.get("/public/agents", params={"q": "zzyxnamematch"})
    assert {a["genticspace_id"] for a in resp.json()["agents"]} == {name_agent}

    none_resp = await client.get("/public/agents", params={"q": "NoAgentContainsThisToken"})
    body = none_resp.json()
    assert body["agents"] == []
    assert body["total"] == 0


# --- GET /agents (key-gated legacy/"partner API" surface) -------------------
#
# Wired to the exact same query_agents() as /public/agents above — these
# mirror the /public/agents cases one-for-one to prove the legacy surface
# hasn't quietly diverged (or lost `q` support) during the moderation port.

async def test_legacy_search_matches_on_name(client, master_key_headers):
    async with db_module.get_conn() as conn:
        name_agent, desc_agent, skill_agent = await _seed_three_distinct_agents(conn)

    resp = await client.get("/agents", params={"q": "ZzyxNameMatch"}, headers=master_key_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert {a["genticspace_id"] for a in body["agents"]} == {name_agent}
    assert body["total"] == 1


async def test_legacy_search_matches_on_description(client, master_key_headers):
    async with db_module.get_conn() as conn:
        name_agent, desc_agent, skill_agent = await _seed_three_distinct_agents(conn)

    resp = await client.get("/agents", params={"q": "ZzyxDescMatch"}, headers=master_key_headers)
    assert {a["genticspace_id"] for a in resp.json()["agents"]} == {desc_agent}


async def test_legacy_search_matches_on_skill_name_and_tags(client, master_key_headers):
    async with db_module.get_conn() as conn:
        name_agent, desc_agent, skill_agent = await _seed_three_distinct_agents(conn)

    by_skill_name = await client.get(
        "/agents", params={"q": "ZzyxSkillNameMatch"}, headers=master_key_headers
    )
    assert {a["genticspace_id"] for a in by_skill_name.json()["agents"]} == {skill_agent}

    by_tag = await client.get("/agents", params={"q": "ZzyxTagMatch"}, headers=master_key_headers)
    assert {a["genticspace_id"] for a in by_tag.json()["agents"]} == {skill_agent}


async def test_legacy_search_does_not_match_unrelated_text(client, master_key_headers):
    async with db_module.get_conn() as conn:
        await _seed_three_distinct_agents(conn)

    resp = await client.get(
        "/agents", params={"q": "NoAgentContainsThisToken"}, headers=master_key_headers
    )
    body = resp.json()
    assert body["agents"] == []
    assert body["total"] == 0


# --- GET /agents/categories and GET /public/agents/categories ---------------

async def test_categories_returns_correct_distinct_counts_and_ordering_on_both_surfaces(
    client, master_key_headers
):
    async with db_module.get_conn() as conn:
        a1, a2, a3 = unique_id(), unique_id(), unique_id()
        await insert_agent(conn, genticspace_id=a1, name="Agent One")
        await insert_agent(conn, genticspace_id=a2, name="Agent Two")
        await insert_agent(conn, genticspace_id=a3, name="Agent Three")

        # cat-a: agents 1 and 2 (agent_count = 2)
        await insert_skill(conn, genticspace_id=a1, skill_name="s1", tags=["cat-a"])
        await insert_skill(conn, genticspace_id=a2, skill_name="s2", tags=["cat-a", "cat-b"])
        # cat-c: only agent 3 (agent_count = 1)
        await insert_skill(conn, genticspace_id=a3, skill_name="s3", tags=["cat-c"])

    expected = {"cat-a": 2, "cat-b": 1, "cat-c": 1}
    expected_order = ["cat-a", "cat-b", "cat-c"]  # agent_count DESC, then category ASC

    legacy_resp = await client.get("/agents/categories", headers=master_key_headers)
    assert legacy_resp.status_code == 200
    legacy_categories = legacy_resp.json()["categories"]
    assert {c["category"]: c["agent_count"] for c in legacy_categories} == expected
    assert [c["category"] for c in legacy_categories] == expected_order

    public_resp = await client.get("/public/agents/categories")
    assert public_resp.status_code == 200
    public_categories = public_resp.json()["categories"]
    assert {c["category"]: c["agent_count"] for c in public_categories} == expected
    assert [c["category"] for c in public_categories] == expected_order


async def test_categories_counts_an_agent_once_even_with_a_repeated_tag_across_skills(
    client, master_key_headers
):
    async with db_module.get_conn() as conn:
        agent = unique_id()
        await insert_agent(conn, genticspace_id=agent, name="Repeated Tag Agent")
        await insert_skill(conn, genticspace_id=agent, skill_name="s1", tags=["dup-tag"])
        await insert_skill(conn, genticspace_id=agent, skill_name="s2", tags=["dup-tag"])

    legacy = await client.get("/agents/categories", headers=master_key_headers)
    assert {c["category"]: c["agent_count"] for c in legacy.json()["categories"]}["dup-tag"] == 1

    public = await client.get("/public/agents/categories")
    assert {c["category"]: c["agent_count"] for c in public.json()["categories"]}["dup-tag"] == 1
