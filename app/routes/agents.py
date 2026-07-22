import json
import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field, HttpUrl, field_validator

from app.db.auth import verify_api_key
from app.db.database import get_conn
from app.rate_limit import limiter
from app.services.agent_queries import list_skill_categories, query_agents
from app.services.trust_summary import compute_trust_summary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"], dependencies=[Depends(verify_api_key)])

# Separate, unauthenticated router for the new anonymous submission path
# (POST /agents/submit) — deliberately NOT part of `router` above, which is
# key-gated at the router level. This is a distinct, lower-trust channel
# from the existing authenticated Contribute flow (POST /public/agents,
# source='tracent', instant-live, no moderation) — that flow is unchanged.
# Anonymous submissions land as source='self-submitted',
# moderation_status='pending', invisible until an admin approves them via
# POST /admin/submissions/{tracent_id}/review. Rate-limited instead of
# key-gated since requiring an API key for an anonymous end-user action
# defeats the point.
submit_router = APIRouter(prefix="/agents", tags=["agents"])


def _row_to_dict(row) -> dict:
    # Strip fields that must only ever be visible through the authenticated
    # admin moderation endpoint (GET /admin/submissions), never in a public
    # listing/search/detail response: submitter_email (PII) and
    # moderation_note (may contain internal review commentary).
    d = dict(row)
    d.pop("submitter_email", None)
    d.pop("moderation_note", None)
    return d


def _generate_submission_id() -> str:
    # Same trc_ + random-suffix shape as app/services/indexer.py's
    # _generate_tracent_id, so anonymously-submitted agents get IDs
    # indistinguishable in shape from any other source.
    suffix = secrets.token_urlsafe(10)[:10]
    return f"trc_{suffix}"


class SkillSubmitBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)


class AgentSubmitBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    endpoint_url: HttpUrl
    skills: list[SkillSubmitBody] = Field(default_factory=list, max_length=25)
    submitter_email: str = Field(..., max_length=320)

    @field_validator("submitter_email")
    @classmethod
    def _valid_email(cls, v: str) -> str:
        v = v.strip()
        if "@" not in v or "." not in v.split("@")[-1].strip() or len(v) < 5:
            raise ValueError("submitter_email must be a valid email address")
        return v


@submit_router.post("/submit", status_code=201)
@limiter.limit("5/minute")
async def submit_agent(request: Request, body: AgentSubmitBody):
    """
    Public "submit your agent" intake — the anonymous, no-account path.
    Does not appear in GET /agents, GET /public/agents, or search/categories
    until approved via POST /admin/submissions/{tracent_id}/review.
    """
    tracent_id = _generate_submission_id()
    endpoint = str(body.endpoint_url)

    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO agents (
                tracent_id, source, source_id,
                name, description, web_endpoint,
                verified, moderation_status, submitter_email
            ) VALUES (
                $1, 'self-submitted', $1,
                $2, $3, $4,
                FALSE, 'pending', $5
            )
            """,
            tracent_id, body.name, body.description, endpoint, body.submitter_email,
        )
        for skill in body.skills:
            await conn.execute(
                """
                INSERT INTO agent_skills (tracent_id, skill_name, description, tags)
                VALUES ($1, $2, $3, $4)
                """,
                tracent_id, skill.name, skill.description, json.dumps([]),
            )

    logger.info("New self-submitted agent %s from %s (pending review)", tracent_id, body.submitter_email)

    return {
        "tracent_id": tracent_id,
        "moderation_status": "pending",
        "message": (
            "Thanks! Your agent has been submitted for review and will appear "
            "in the public directory once approved."
        ),
    }


def _attach_trust_summary(result: dict, flags: list[dict]) -> dict:
    has_high_flag = any(f["severity"] == "high" for f in flags)
    result["trust_summary"] = compute_trust_summary(
        trust_tier=result.get("trust_tier"),
        verified=bool(result.get("verified", False)),
        has_high_severity_flag=has_high_flag,
    )
    return result


@router.get("/categories")
async def list_categories():
    async with get_conn() as conn:
        return {"categories": await list_skill_categories(conn)}


@router.get("/flagged")
async def list_flagged(
    severity: Optional[str] = Query(None, description="low | medium | high"),
):
    async with get_conn() as conn:
        if severity:
            rows = await conn.fetch(
                """
                SELECT DISTINCT a.* FROM agents a
                JOIN reputation_flags f ON f.tracent_id = a.tracent_id
                WHERE f.severity = $1
                ORDER BY a.risk_score DESC
                """,
                severity,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT DISTINCT a.* FROM agents a
                JOIN reputation_flags f ON f.tracent_id = a.tracent_id
                ORDER BY a.risk_score DESC
                """
            )
        agents = []
        for r in rows:
            d = _row_to_dict(r)
            flags = await conn.fetch(
                "SELECT severity FROM reputation_flags WHERE tracent_id = $1", d["tracent_id"]
            )
            agents.append(_attach_trust_summary(d, [dict(f) for f in flags]))
    return {"agents": agents}


@router.get("")
async def list_agents(
    q: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    source: Optional[str] = None,
    verified: Optional[bool] = None,
    trust_tier: Optional[str] = None,
    a2a_only: bool = False,
    mcp_only: bool = False,
    x402_only: bool = False,
    flagged_only: bool = False,
    safe_only: bool = False,
    industry: Optional[str] = None,
    license: Optional[str] = None,
    deployment: Optional[str] = None,
):
    async with get_conn() as conn:
        return await query_agents(
            conn,
            q=q,
            source=source,
            verified=verified,
            trust_tier=trust_tier,
            a2a_only=a2a_only,
            mcp_only=mcp_only,
            x402_only=x402_only,
            flagged_only=flagged_only,
            safe_only=safe_only,
            industry=industry,
            license=license,
            deployment=deployment,
            page=page,
            page_size=page_size,
        )


@router.get("/source/{source}/{source_id}")
async def get_agent_by_source(source: str, source_id: str):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT tracent_id FROM agents WHERE source = $1 AND source_id = $2",
            source, source_id,
        )
    if not row:
        raise HTTPException(404, f"Agent not found for source={source} source_id={source_id}")
    return await _get_full_profile(row["tracent_id"])


@router.get("/{tracent_id}")
async def get_agent(tracent_id: str):
    return await _get_full_profile(tracent_id)


async def _get_full_profile(tracent_id: str) -> dict:
    async with get_conn() as conn:
        agent = await conn.fetchrow(
            "SELECT * FROM agents WHERE tracent_id = $1", tracent_id
        )
        if not agent:
            raise HTTPException(404, f"Agent {tracent_id} not found")

        skills = await conn.fetch(
            "SELECT * FROM agent_skills WHERE tracent_id = $1", tracent_id
        )
        transfers = await conn.fetch(
            "SELECT * FROM transfer_events WHERE tracent_id = $1 ORDER BY block_number DESC",
            tracent_id,
        )
        flags = await conn.fetch(
            "SELECT * FROM reputation_flags WHERE tracent_id = $1", tracent_id
        )
        verifications = await conn.fetch(
            "SELECT * FROM verification_requests WHERE tracent_id = $1 ORDER BY submitted_at DESC",
            tracent_id,
        )

    result = _row_to_dict(agent)
    result["skills"] = [_row_to_dict(s) for s in skills]
    result["transfers"] = [_row_to_dict(t) for t in transfers]
    result["flags"] = [_row_to_dict(f) for f in flags]
    result["verification_requests"] = [_row_to_dict(v) for v in verifications]
    return _attach_trust_summary(result, result["flags"])
