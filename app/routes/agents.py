import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.db.auth import verify_api_key
from app.db.database import get_conn

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
):
    conditions = []
    params: list = []

    def add(cond: str, val=None):
        params.append(val)
        conditions.append(cond.replace("?", f"${len(params)}"))

    if source:
        add("source = ?", source)
    if verified is not None:
        add("verified = ?", verified)
    if trust_tier:
        add("trust_tier = ?", trust_tier)
    if a2a_only:
        conditions.append("a2a_endpoint IS NOT NULL")
    if mcp_only:
        conditions.append("mcp_endpoint IS NOT NULL")
    if x402_only:
        conditions.append("x402_support = TRUE")
    if safe_only:
        conditions.append("safe_to_transact = TRUE")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    if flagged_only:
        base = f"""
            SELECT DISTINCT a.* FROM agents a
            JOIN reputation_flags f ON f.tracent_id = a.tracent_id
            {where}
        """
    else:
        base = f"SELECT * FROM agents {where}"

    async with get_conn() as conn:
        total = await conn.fetchval(
            f"SELECT COUNT(*) FROM ({base}) sub", *params
        )
        offset = (page - 1) * page_size
        rows = await conn.fetch(
            f"{base} ORDER BY first_seen DESC LIMIT ${len(params)+1} OFFSET ${len(params)+2}",
            *params, page_size, offset,
        )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "agents": [_row_to_dict(r) for r in rows],
    }


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
