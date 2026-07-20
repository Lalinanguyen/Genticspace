import logging
import secrets
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.db.database import get_conn
from app.db.jwt_auth import get_current_user, get_current_user_optional
from app.services.agent_queries import query_agents
from app.services.deployment_guide import answer_deployment_question, get_or_generate_deployment_guide
from app.services.github_signals import get_github_signals_nonblocking
from app.services.recommender import get_recommendations

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public", tags=["public"])


class AgentListingBody(BaseModel):
    name: str
    description: str
    image_url: Optional[str] = None
    demo_url: Optional[str] = None
    github_url: Optional[str] = None
    huggingface_url: Optional[str] = None
    ard_ref: Optional[str] = None
    producthunt_url: Optional[str] = None
    erc8004_ref: Optional[str] = None
    website_url: Optional[str] = None
    contact_email: Optional[str] = None
    support_channel: Optional[str] = None
    terms_url: Optional[str] = None
    interaction_types: list[str] = []
    sdk_compat: list[str] = []
    industry_tags: list[str] = []
    license: Optional[str] = None
    deployment_types: list[str] = []
    access_model: Optional[str] = None
    pricing_model: Optional[str] = None
    is_private: bool = False


def _new_listing_id() -> str:
    return "usr_" + secrets.token_urlsafe(8)


@router.get("/agents")
async def list_public_agents(
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


@router.get("/agents/{tracent_id}")
async def get_public_agent(
    tracent_id: str, current_user: Optional[dict] = Depends(get_current_user_optional)
):
    async with get_conn() as conn:
        agent = await conn.fetchrow("SELECT * FROM agents WHERE tracent_id = $1", tracent_id)
        if not agent:
            raise HTTPException(404, f"Agent {tracent_id} not found")

        skills = await conn.fetch(
            "SELECT * FROM agent_skills WHERE tracent_id = $1", tracent_id
        )

        is_favorited = False
        if current_user:
            is_favorited = bool(
                await conn.fetchval(
                    "SELECT 1 FROM agent_favorites WHERE user_id = $1 AND tracent_id = $2",
                    current_user["id"], tracent_id,
                )
            )

    result = dict(agent)
    result["skills"] = [dict(s) for s in skills]
    result["is_favorited"] = is_favorited
    return result


@router.get("/my-agents")
async def list_my_agents(current_user: dict = Depends(get_current_user)):
    async with get_conn() as conn:
        rows = await conn.fetch(
            "SELECT * FROM agents WHERE submitted_by = $1 ORDER BY first_seen DESC",
            current_user["id"],
        )
    return {"agents": [dict(r) for r in rows]}


@router.post("/agents")
async def create_agent_listing(
    body: AgentListingBody, current_user: dict = Depends(get_current_user)
):
    if not body.name.strip() or not body.description.strip():
        raise HTTPException(400, "Name and description are required")

    tracent_id = _new_listing_id()
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO agents (
                tracent_id, source, source_id, name, description, web_endpoint,
                image_url, demo_url,
                github_url, huggingface_url, ard_ref, producthunt_url, erc8004_ref,
                contact_email, support_channel, terms_url,
                interaction_types, sdk_compat, industry_tags,
                license, deployment_types, access_model, pricing_model,
                is_private, submitted_by, is_active
            ) VALUES (
                $1, 'tracent', $1, $2, $3, $4,
                $5, $6,
                $7, $8, $9, $10, $11,
                $12, $13, $14,
                $15, $16, $17,
                $18, $19, $20, $21,
                $22, $23, TRUE
            )
            RETURNING *
            """,
            tracent_id,
            body.name.strip(),
            body.description.strip(),
            body.website_url,
            body.image_url,
            body.demo_url,
            body.github_url,
            body.huggingface_url,
            body.ard_ref,
            body.producthunt_url,
            body.erc8004_ref,
            body.contact_email,
            body.support_channel,
            body.terms_url,
            body.interaction_types,
            body.sdk_compat,
            body.industry_tags,
            body.license,
            body.deployment_types,
            body.access_model,
            body.pricing_model,
            body.is_private,
            current_user["id"],
        )
    return dict(row)


@router.patch("/agents/{tracent_id}")
async def update_agent_listing(
    tracent_id: str,
    body: AgentListingBody,
    current_user: dict = Depends(get_current_user),
):
    if not body.name.strip() or not body.description.strip():
        raise HTTPException(400, "Name and description are required")

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT submitted_by FROM agents WHERE tracent_id = $1", tracent_id
        )
        if not existing:
            raise HTTPException(404, f"Agent {tracent_id} not found")
        if existing["submitted_by"] != current_user["id"]:
            raise HTTPException(403, "You can only edit listings you created")

        row = await conn.fetchrow(
            """
            UPDATE agents SET
                name = $2, description = $3, web_endpoint = $4,
                image_url = $5, demo_url = $6,
                github_url = $7, huggingface_url = $8, ard_ref = $9,
                producthunt_url = $10, erc8004_ref = $11,
                contact_email = $12, support_channel = $13, terms_url = $14,
                interaction_types = $15, sdk_compat = $16, industry_tags = $17,
                license = $18, deployment_types = $19, access_model = $20, pricing_model = $21,
                is_private = $22, last_indexed = NOW()
            WHERE tracent_id = $1
            RETURNING *
            """,
            tracent_id,
            body.name.strip(),
            body.description.strip(),
            body.website_url,
            body.image_url,
            body.demo_url,
            body.github_url,
            body.huggingface_url,
            body.ard_ref,
            body.producthunt_url,
            body.erc8004_ref,
            body.contact_email,
            body.support_channel,
            body.terms_url,
            body.interaction_types,
            body.sdk_compat,
            body.industry_tags,
            body.license,
            body.deployment_types,
            body.access_model,
            body.pricing_model,
            body.is_private,
        )
    return dict(row)


@router.get("/agents/{tracent_id}/deployment-guide")
async def agent_deployment_guide(
    tracent_id: str,
    experience_level: Optional[str] = Query(
        None, description="Beginner | Intermediate | Advanced, defaults to the logged-in user's own level"
    ),
    force: bool = False,
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    level = experience_level or (current_user.get("experience_level") if current_user else None)
    try:
        return await get_or_generate_deployment_guide(tracent_id, level, force=force)
    except LookupError as exc:
        raise HTTPException(404, str(exc))


class DeploymentGuideChatTurn(BaseModel):
    role: str
    content: str


class DeploymentGuideChatBody(BaseModel):
    question: str
    history: list[DeploymentGuideChatTurn] = []


@router.post("/agents/{tracent_id}/deployment-guide/ask")
async def agent_deployment_guide_ask(
    tracent_id: str,
    body: DeploymentGuideChatBody,
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    if not body.question.strip():
        raise HTTPException(400, "Question is required")

    level = current_user.get("experience_level") if current_user else None
    try:
        answer = await answer_deployment_question(
            tracent_id,
            body.question.strip(),
            level,
            [t.model_dump() for t in body.history],
        )
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    return {"answer": answer}


@router.get("/top-providers")
async def top_providers(limit: int = Query(12, ge=1, le=50)):
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT
              a.provider_org AS name,
              a.source,
              COUNT(*) AS agent_count,
              MAX(COALESCE(hp.num_followers, gp.followers, 0)) AS followers,
              MAX(COALESCE(hp.avatar_url, gp.avatar_url)) AS image_url,
              (SELECT array_agg(t) FROM (
                  SELECT DISTINCT tag AS t
                  FROM agents a2, unnest(a2.industry_tags) AS tag
                  WHERE a2.provider_org = a.provider_org AND a2.source = a.source
                  LIMIT 2
              ) sub) AS industry_tags
            FROM agents a
            LEFT JOIN huggingface_profiles hp ON hp.username = a.provider_org AND a.source = 'huggingface'
            LEFT JOIN github_profiles gp ON gp.username = a.provider_org AND a.source = 'github'
            WHERE a.provider_org IS NOT NULL AND a.provider_org != '' AND a.is_private IS NOT TRUE
            GROUP BY a.provider_org, a.source
            ORDER BY followers DESC, agent_count DESC
            LIMIT $1
            """,
            limit,
        )
    return {"providers": [dict(r) for r in rows]}


@router.get("/recommendations")
async def recommendations(
    task: str = Query("", description="Free-text description of what the user wants to do"),
    limit: int = Query(10, ge=1, le=50),
    current_user: Optional[dict] = Depends(get_current_user_optional),
):
    if current_user:
        # Non-blocking: analyzing a user's repos is up to ~20 live GitHub
        # calls, so this only serves what's already cached and refreshes in
        # the background rather than stalling the request on GitHub's API.
        await get_github_signals_nonblocking(current_user["id"], current_user.get("github_username"))

    user = current_user or {"id": None, "experience_level": None}

    async with get_conn() as conn:
        return {
            "recommendations": await get_recommendations(
                conn, user, task, filters={}, limit=limit
            )
        }
