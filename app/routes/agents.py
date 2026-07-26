import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.auth import verify_api_key
from app.db.database import get_conn
from app.services.agent_queries import query_agents

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/agents", tags=["agents"], dependencies=[Depends(verify_api_key)])


def _row_to_dict(row) -> dict:
    return dict(row)


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
    return {"agents": [_row_to_dict(r) for r in rows]}


@router.get("")
async def list_agents(
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
    return result
