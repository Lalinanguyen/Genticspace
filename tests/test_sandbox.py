"""
Sandbox Mode (Track A: HuggingFace Spaces). Covers the sandboxable
computation/filter end to end on real data, and the guide endpoint's error
paths. Does not exercise get_sandbox_task_guidance's actual Anthropic call
(no ANTHROPIC_API_KEY in the test environment — see conftest.py — matching
the existing convention that deployment_guide.py's LLM call is likewise
untested here).
"""
import pytest

from app.config import settings
from app.db.database import get_conn
from app.services.agent_queries import compute_sandbox_fields
from tests.helpers import insert_agent


def test_compute_sandbox_fields_space_open_source():
    agent = {"source": "huggingface", "source_id": "spaces:owner/cool-space", "license": "Open Source"}
    compute_sandbox_fields(agent)
    assert agent["sandboxable"] is True
    assert agent["sandbox_url"] == "https://huggingface.co/spaces/owner/cool-space"


def test_compute_sandbox_fields_space_without_license():
    agent = {"source": "huggingface", "source_id": "spaces:owner/cool-space", "license": None}
    compute_sandbox_fields(agent)
    assert agent["sandboxable"] is False
    assert agent["sandbox_url"] is None


def test_compute_sandbox_fields_hf_model_not_space():
    agent = {"source": "huggingface", "source_id": "models:owner/some-model", "license": "Open Source"}
    compute_sandbox_fields(agent)
    assert agent["sandboxable"] is False
    assert agent["sandbox_url"] is None


def test_compute_sandbox_fields_github_never_sandboxable():
    agent = {"source": "github", "source_id": "owner/repo", "license": "Open Source"}
    compute_sandbox_fields(agent)
    assert agent["sandboxable"] is False
    assert agent["sandbox_url"] is None


@pytest.mark.asyncio(loop_scope="session")
async def test_sandboxable_only_filter_on_public_agents(client):
    async with get_conn() as conn:
        await insert_agent(
            conn, tracent_id="gs_space_yes", source="huggingface",
            source_id="spaces:owner/yes-space", name="Yes Space", license="Open Source",
        )
        await insert_agent(
            conn, tracent_id="gs_space_no_license", source="huggingface",
            source_id="spaces:owner/no-license-space", name="No License Space",
        )
        await insert_agent(
            conn, tracent_id="gs_model", source="huggingface",
            source_id="models:owner/model", name="A Model", license="Open Source",
        )
        await insert_agent(
            conn, tracent_id="gs_gh", source="github",
            source_id="owner/repo", name="A Repo", license="Open Source",
        )

    resp = await client.get("/public/agents", params={"sandboxable_only": "true"})
    assert resp.status_code == 200
    ids = {a["tracent_id"] for a in resp.json()["agents"]}
    assert ids == {"gs_space_yes"}

    resp = await client.get("/agents", params={"sandboxable_only": "true"}, headers={"X-API-Key": settings.API_KEY})
    assert resp.status_code == 200
    ids = {a["tracent_id"] for a in resp.json()["agents"]}
    assert ids == {"gs_space_yes"}, "legacy /agents surface must apply the same sandboxable filter as /public/agents"


@pytest.mark.asyncio(loop_scope="session")
async def test_agent_detail_includes_sandbox_fields(client):
    async with get_conn() as conn:
        await insert_agent(
            conn, tracent_id="gs_space_detail", source="huggingface",
            source_id="spaces:owner/detail-space", name="Detail Space", license="Open Source",
        )

    resp = await client.get("/public/agents/gs_space_detail")
    assert resp.status_code == 200
    body = resp.json()
    assert body["sandboxable"] is True
    assert body["sandbox_url"] == "https://huggingface.co/spaces/owner/detail-space"


@pytest.mark.asyncio(loop_scope="session")
async def test_sandbox_guide_404_for_non_sandboxable_agent(client):
    async with get_conn() as conn:
        await insert_agent(
            conn, tracent_id="gs_not_sandboxable", source="github",
            source_id="owner/repo", name="A Repo", license="Open Source",
        )

    resp = await client.post("/public/agents/gs_not_sandboxable/sandbox/guide", json={"task": "summarize a pdf"})
    assert resp.status_code == 404


@pytest.mark.asyncio(loop_scope="session")
async def test_sandbox_guide_404_for_nonexistent_agent(client):
    resp = await client.post("/public/agents/does_not_exist/sandbox/guide", json={"task": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio(loop_scope="session")
async def test_sandbox_guide_400_for_empty_task(client):
    async with get_conn() as conn:
        await insert_agent(
            conn, tracent_id="gs_space_empty_task", source="huggingface",
            source_id="spaces:owner/space", name="Space", license="Open Source",
        )

    resp = await client.post("/public/agents/gs_space_empty_task/sandbox/guide", json={"task": "   "})
    assert resp.status_code == 400


@pytest.mark.asyncio(loop_scope="session")
async def test_sandbox_guide_503_without_anthropic_key(client):
    # conftest.py deliberately pops ANTHROPIC_API_KEY from the environment
    # for the whole test session (see its comment) — this confirms a
    # sandboxable agent correctly reaches the "not configured" branch rather
    # than silently succeeding or erroring some other way.
    async with get_conn() as conn:
        await insert_agent(
            conn, tracent_id="gs_space_no_key", source="huggingface",
            source_id="spaces:owner/space", name="Space", license="Open Source",
        )

    resp = await client.post("/public/agents/gs_space_no_key/sandbox/guide", json={"task": "summarize a pdf"})
    assert resp.status_code == 503
