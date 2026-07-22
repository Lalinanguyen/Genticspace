"""
Tests for the new anonymous submission-and-moderation state machine
(POST /agents/submit -> pending -> admin approve/reject, in
app/routes/agents.py's `submit_router` + app/routes/admin.py's
/admin/submissions* routes) and, critically, that it does NOT touch or gate
deslop's *existing*, separate authenticated Contribute flow
(POST /public/agents, source='genticspace', submitted_by set), which must stay
instant-live exactly as before.

  - A fresh anonymous submission is 'pending' and invisible in GET /agents
    (legacy, key-gated) and GET /public/agents (both surfaces share
    query_agents(), whose moderation_status='approved' filter is what
    hides it).
  - GET /admin/submissions (key-gated) lists it, submitter_email included.
  - Approving/rejecting flips moderation_status via
    POST /admin/submissions/{id}/review; rejecting keeps it hidden forever
    (no re-review of an already-reviewed submission -> 400).
  - submitter_email / moderation_note are admin-only: present in
    GET /admin/submissions, absent from every other response that could
    expose a given agent (GET /agents, GET /public/agents, GET /agents/{id},
    GET /public/agents/{id}) at every stage (pending, approved, rejected).
  - POST /public/agents with a real JWT (see conftest.py's `jwt_user`
    fixture) is unaffected: instant-live, moderation_status='approved' by
    the schema default, no submitter_email/moderation gate involved at all.
"""
from app.db import database as db_module
from tests.helpers import insert_skill, unique_id


SUBMIT_BODY = {
    "name": "Recipe Finder",
    "description": "Suggests recipes from a list of ingredients.",
    "endpoint_url": "https://recipe-finder.example.com/a2a",
    "skills": [{"name": "recipe_search", "description": "Find recipes by ingredient."}],
    "submitter_email": "submitter@example.com",
}


async def _submit(client, **overrides):
    body = {**SUBMIT_BODY, **overrides}
    resp = await client.post("/agents/submit", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- Anonymous submission creates a pending, invisible agent ----------------

async def test_submit_requires_no_auth_and_creates_pending_agent(client):
    result = await _submit(client)
    assert result["moderation_status"] == "pending"
    assert result["genticspace_id"].startswith("trc_")


async def test_pending_agent_absent_from_legacy_list_agents(client, master_key_headers):
    result = await _submit(client, name="Ghost Agent Legacy")
    resp = await client.get("/agents", headers=master_key_headers)
    ids = {a["genticspace_id"] for a in resp.json()["agents"]}
    assert result["genticspace_id"] not in ids

    search_resp = await client.get(
        "/agents", params={"q": "Ghost Agent Legacy"}, headers=master_key_headers
    )
    assert result["genticspace_id"] not in {a["genticspace_id"] for a in search_resp.json()["agents"]}


async def test_pending_agent_absent_from_public_agents(client):
    result = await _submit(client, name="Ghost Agent Public")
    resp = await client.get("/public/agents")
    ids = {a["genticspace_id"] for a in resp.json()["agents"]}
    assert result["genticspace_id"] not in ids

    search_resp = await client.get("/public/agents", params={"q": "Ghost Agent Public"})
    assert result["genticspace_id"] not in {a["genticspace_id"] for a in search_resp.json()["agents"]}


async def test_pending_agent_excluded_from_both_categories_surfaces(client, master_key_headers):
    result = await _submit(client, name="Category Ghost")
    genticspace_id = result["genticspace_id"]

    async with db_module.get_conn() as conn:
        await insert_skill(conn, genticspace_id=genticspace_id, skill_name="ghost-skill", tags=["ghost-category"])

    legacy = await client.get("/agents/categories", headers=master_key_headers)
    assert "ghost-category" not in {c["category"] for c in legacy.json()["categories"]}

    public = await client.get("/public/agents/categories")
    assert "ghost-category" not in {c["category"] for c in public.json()["categories"]}


async def test_pending_agent_visible_via_direct_id_lookup_on_both_surfaces(client, master_key_headers):
    result = await _submit(client)
    genticspace_id = result["genticspace_id"]

    legacy = await client.get(f"/agents/{genticspace_id}", headers=master_key_headers)
    assert legacy.status_code == 200
    assert legacy.json()["moderation_status"] == "pending"

    public = await client.get(f"/public/agents/{genticspace_id}")
    assert public.status_code == 200
    assert public.json()["moderation_status"] == "pending"


# --- Admin submissions queue -------------------------------------------------

async def test_admin_submissions_requires_auth(client):
    resp = await client.get("/admin/submissions")
    assert resp.status_code == 401


async def test_admin_submissions_lists_pending_with_submitter_email(client, master_key_headers):
    result = await _submit(client, submitter_email="findme@example.com")

    resp = await client.get("/admin/submissions", headers=master_key_headers)
    assert resp.status_code == 200
    submissions = {s["genticspace_id"]: s for s in resp.json()["submissions"]}
    assert result["genticspace_id"] in submissions
    assert submissions[result["genticspace_id"]]["submitter_email"] == "findme@example.com"
    assert submissions[result["genticspace_id"]]["moderation_status"] == "pending"


# --- submitter_email / moderation_note are never public, at any stage ------

async def test_submitter_email_and_note_never_leak_while_pending(client, master_key_headers):
    result = await _submit(client, name="Privacy Check Pending")
    genticspace_id = result["genticspace_id"]

    for path in (f"/agents/{genticspace_id}", f"/public/agents/{genticspace_id}"):
        headers = master_key_headers if path.startswith("/agents/") else {}
        resp = await client.get(path, headers=headers)
        assert "submitter_email" not in resp.json()
        assert "moderation_note" not in resp.json()


async def test_submitter_email_and_note_never_leak_after_approval(client, master_key_headers):
    result = await _submit(client, name="Privacy Check Approved")
    genticspace_id = result["genticspace_id"]

    approve = await client.post(
        f"/admin/submissions/{genticspace_id}/review",
        json={"action": "approve", "note": "internal reviewer commentary"},
        headers=master_key_headers,
    )
    assert approve.status_code == 200

    legacy_list = await client.get("/agents", headers=master_key_headers)
    for agent in legacy_list.json()["agents"]:
        assert "submitter_email" not in agent
        assert "moderation_note" not in agent

    public_list = await client.get("/public/agents")
    for agent in public_list.json()["agents"]:
        assert "submitter_email" not in agent
        assert "moderation_note" not in agent

    legacy_detail = await client.get(f"/agents/{genticspace_id}", headers=master_key_headers)
    assert "submitter_email" not in legacy_detail.json()
    assert "moderation_note" not in legacy_detail.json()

    public_detail = await client.get(f"/public/agents/{genticspace_id}")
    assert "submitter_email" not in public_detail.json()
    assert "moderation_note" not in public_detail.json()

    # But it IS in admin/submissions... except once approved it drops out of
    # that queue (see test_approved_submission_disappears_from_admin_queue).
    # The reviewer note itself is only ever surfaced via direct DB access —
    # there's no admin "approved log" endpoint in this port, which is fine:
    # the point under test is that it never reaches a *public* response.


# --- Review actions: approve / reject / already-reviewed / unknown id -------

async def test_approving_makes_agent_appear_on_both_surfaces(client, master_key_headers):
    result = await _submit(client, name="Now You See Me")
    genticspace_id = result["genticspace_id"]

    before_legacy = await client.get("/agents", headers=master_key_headers)
    assert genticspace_id not in {a["genticspace_id"] for a in before_legacy.json()["agents"]}
    before_public = await client.get("/public/agents")
    assert genticspace_id not in {a["genticspace_id"] for a in before_public.json()["agents"]}

    review = await client.post(
        f"/admin/submissions/{genticspace_id}/review",
        json={"action": "approve", "note": "looks good"},
        headers=master_key_headers,
    )
    assert review.status_code == 200
    assert review.json()["moderation_status"] == "approved"

    after_legacy = await client.get("/agents", headers=master_key_headers)
    assert genticspace_id in {a["genticspace_id"] for a in after_legacy.json()["agents"]}
    after_public = await client.get("/public/agents")
    assert genticspace_id in {a["genticspace_id"] for a in after_public.json()["agents"]}


async def test_rejecting_keeps_agent_hidden_on_both_surfaces(client, master_key_headers):
    result = await _submit(client, name="Rejected Agent")
    genticspace_id = result["genticspace_id"]

    review = await client.post(
        f"/admin/submissions/{genticspace_id}/review",
        json={"action": "reject", "note": "endpoint unreachable"},
        headers=master_key_headers,
    )
    assert review.status_code == 200
    assert review.json()["moderation_status"] == "rejected"

    legacy = await client.get("/agents", headers=master_key_headers)
    assert genticspace_id not in {a["genticspace_id"] for a in legacy.json()["agents"]}
    public = await client.get("/public/agents")
    assert genticspace_id not in {a["genticspace_id"] for a in public.json()["agents"]}

    # Still directly fetchable by ID on both surfaces (only browse/search are filtered).
    legacy_detail = await client.get(f"/agents/{genticspace_id}", headers=master_key_headers)
    assert legacy_detail.status_code == 200
    assert legacy_detail.json()["moderation_status"] == "rejected"

    public_detail = await client.get(f"/public/agents/{genticspace_id}")
    assert public_detail.status_code == 200
    assert public_detail.json()["moderation_status"] == "rejected"


async def test_reviewing_an_already_reviewed_submission_returns_400(client, master_key_headers):
    result = await _submit(client)
    genticspace_id = result["genticspace_id"]

    first = await client.post(
        f"/admin/submissions/{genticspace_id}/review",
        json={"action": "approve"},
        headers=master_key_headers,
    )
    assert first.status_code == 200

    second = await client.post(
        f"/admin/submissions/{genticspace_id}/review",
        json={"action": "reject"},
        headers=master_key_headers,
    )
    assert second.status_code == 400


async def test_reviewing_unknown_genticspace_id_returns_404(client, master_key_headers):
    resp = await client.post(
        "/admin/submissions/trc_does_not_exist/review",
        json={"action": "approve"},
        headers=master_key_headers,
    )
    assert resp.status_code == 404


async def test_review_requires_auth(client):
    result = await _submit(client)
    resp = await client.post(
        f"/admin/submissions/{result['genticspace_id']}/review",
        json={"action": "approve"},
    )
    assert resp.status_code == 401


async def test_approved_submission_disappears_from_admin_queue(client, master_key_headers):
    result = await _submit(client)
    genticspace_id = result["genticspace_id"]

    pending_list = await client.get("/admin/submissions", headers=master_key_headers)
    assert genticspace_id in {s["genticspace_id"] for s in pending_list.json()["submissions"]}

    await client.post(
        f"/admin/submissions/{genticspace_id}/review",
        json={"action": "approve"},
        headers=master_key_headers,
    )

    after_list = await client.get("/admin/submissions", headers=master_key_headers)
    assert genticspace_id not in {s["genticspace_id"] for s in after_list.json()["submissions"]}


async def test_reject_does_not_touch_a_different_pending_agents_source_or_moderation(client, master_key_headers):
    # Sanity check for cross-contamination between two pending submissions.
    keep = await _submit(client, name="Keep Pending")
    reject = await _submit(client, name="To Reject")

    await client.post(
        f"/admin/submissions/{reject['genticspace_id']}/review",
        json={"action": "reject"},
        headers=master_key_headers,
    )

    still_pending = await client.get("/admin/submissions", headers=master_key_headers)
    ids = {s["genticspace_id"] for s in still_pending.json()["submissions"]}
    assert keep["genticspace_id"] in ids
    assert reject["genticspace_id"] not in ids


# --- The EXISTING authenticated Contribute flow must stay UNCHANGED --------

LISTING_BODY = {
    "name": "My Own Agent",
    "description": "A hand-listed agent via the authenticated Contribute page.",
    "website_url": "https://my-own-agent.example.com",
}


async def test_contribute_flow_is_instant_live_with_no_moderation_gate(client, jwt_user):
    _, _, auth_headers = jwt_user

    resp = await client.post("/public/agents", json=LISTING_BODY, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    created = resp.json()

    # Unlike POST /agents/submit, this is source='genticspace' and carries no
    # moderation_status='pending' gate — DEFAULT 'approved' at the schema
    # level means it's already publicly visible with no admin action.
    assert created["source"] == "genticspace"
    assert created.get("moderation_status") in (None, "approved")

    genticspace_id = created["genticspace_id"]

    # Immediately visible on the public browse surface — no approval step needed.
    public_list = await client.get("/public/agents")
    assert genticspace_id in {a["genticspace_id"] for a in public_list.json()["agents"]}


async def test_contribute_flow_agent_is_immediately_visible_on_legacy_surface_too(
    client, jwt_user, master_key_headers
):
    _, _, auth_headers = jwt_user
    resp = await client.post("/public/agents", json=LISTING_BODY, headers=auth_headers)
    assert resp.status_code == 200, resp.text
    genticspace_id = resp.json()["genticspace_id"]

    legacy_list = await client.get("/agents", headers=master_key_headers)
    assert genticspace_id in {a["genticspace_id"] for a in legacy_list.json()["agents"]}

    # It never shows up in the anonymous-submission moderation queue either —
    # these are two entirely separate pipelines.
    submissions = await client.get("/admin/submissions", headers=master_key_headers)
    assert genticspace_id not in {s["genticspace_id"] for s in submissions.json()["submissions"]}


async def test_contribute_flow_requires_a_jwt_not_an_api_key(client, master_key_headers):
    # Confirms the two auth systems don't cross-accept each other's
    # credentials: an admin X-API-Key is not a substitute for a user JWT here.
    resp = await client.post("/public/agents", json=LISTING_BODY, headers=master_key_headers)
    assert resp.status_code == 401


async def test_contribute_flow_rejects_with_no_auth_at_all(client):
    resp = await client.post("/public/agents", json=LISTING_BODY)
    assert resp.status_code == 401
