"""
Auth tests for app/db/auth.py's verify_api_key, against deslop's real
router wiring:

  - Everything under /admin/* requires X-API-Key — either the master
    settings.API_KEY, or a non-revoked per-client key minted via
    POST /admin/api-keys (app/routes/admin.py).
  - The original /agents and /trust routers (app/routes/agents.py's
    `router`, app/routes/trust.py) are key-gated at the router level — this
    is deslop's existing "partner API" tier, untouched by the new
    moderation work.
  - The separate /public/agents* surface (app/routes/public.py) requires NO
    key at all — that's what the real frontend calls.
  - The new anonymous POST /agents/submit (app/routes/agents.py's
    `submit_router`) also requires no key (see test_moderation.py /
    test_rate_limit.py), but is not re-tested here.
"""
import pytest

from app.db.auth import hash_api_key
from app.db import database as db_module


ADMIN_PROBE_ROUTE = "/admin/stats"


async def test_master_key_succeeds_on_admin_route(client, master_key_headers):
    resp = await client.get(ADMIN_PROBE_ROUTE, headers=master_key_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "total_agents" in body
    assert "verified_count" in body
    assert "flagged_count" in body


async def test_admin_route_with_no_key_returns_401(client):
    resp = await client.get(ADMIN_PROBE_ROUTE)
    assert resp.status_code == 401


async def test_admin_route_with_garbage_key_returns_401(client):
    resp = await client.get(ADMIN_PROBE_ROUTE, headers={"X-API-Key": "not-a-real-key"})
    assert resp.status_code == 401


async def test_minted_per_client_key_succeeds_on_admin_route(client, master_key_headers):
    mint_resp = await client.post(
        "/admin/api-keys",
        json={"owner_email": "dev@example.com", "label": "test key"},
        headers=master_key_headers,
    )
    assert mint_resp.status_code == 201
    minted_key = mint_resp.json()["api_key"]
    assert minted_key  # raw key returned exactly once, at mint time

    probe = await client.get(ADMIN_PROBE_ROUTE, headers={"X-API-Key": minted_key})
    assert probe.status_code == 200


async def test_revoked_per_client_key_is_rejected(client, master_key_headers):
    mint_resp = await client.post(
        "/admin/api-keys",
        json={"owner_email": "dev@example.com", "label": "to be revoked"},
        headers=master_key_headers,
    )
    minted_key = mint_resp.json()["api_key"]

    # No revoke endpoint exists — revoke directly via the DB, as an operator
    # would (per app/db/auth.py's docstring: the key is looked up by
    # sha256 hash with `AND revoked_at IS NULL`).
    async with db_module.get_conn() as conn:
        await conn.execute(
            "UPDATE api_keys SET revoked_at = NOW() WHERE key_hash = $1",
            hash_api_key(minted_key),
        )

    probe = await client.get(ADMIN_PROBE_ROUTE, headers={"X-API-Key": minted_key})
    assert probe.status_code == 401


async def test_minted_key_still_works_before_revocation_for_a_second_admin_route(client, master_key_headers):
    # Confirms the caveat documented in app/db/auth.py: a valid per-client
    # key grants access to *any* /admin/* route, not just the one it was
    # tested against above.
    mint_resp = await client.post(
        "/admin/api-keys",
        json={"owner_email": "dev2@example.com"},
        headers=master_key_headers,
    )
    minted_key = mint_resp.json()["api_key"]
    resp = await client.get("/admin/sources", headers={"X-API-Key": minted_key})
    assert resp.status_code == 200


@pytest.mark.parametrize("method, path", [("GET", "/agents"), ("GET", "/agents/categories"), ("GET", "/agents/flagged")])
async def test_legacy_agents_router_requires_a_key(client, method, path):
    no_key = await client.request(method, path)
    assert no_key.status_code == 401

    with_key = await client.request(method, path, headers={"X-API-Key": "not-a-real-key"})
    assert with_key.status_code == 401


async def test_legacy_agents_router_succeeds_with_master_key(client, master_key_headers):
    resp = await client.get("/agents", headers=master_key_headers)
    assert resp.status_code == 200
    assert "agents" in resp.json()


async def test_trust_router_also_requires_a_key(client):
    resp = await client.get("/trust/trc_does_not_exist")
    assert resp.status_code == 401


@pytest.mark.parametrize("path", ["/public/agents", "/public/agents/categories"])
async def test_public_agents_surface_requires_no_key(client, path):
    resp = await client.get(path)
    assert resp.status_code == 200


async def test_public_agent_detail_404s_without_needing_a_key(client):
    # A missing agent still 404s (not 401) with no key at all — proves the
    # route has no auth dependency, it just has nothing to return.
    resp = await client.get("/public/agents/trc_does_not_exist")
    assert resp.status_code == 404
