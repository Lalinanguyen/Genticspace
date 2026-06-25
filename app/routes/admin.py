import logging
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from app.db.auth import verify_api_key
from app.db.database import get_conn
from app.services.indexer import ingest_agents
from app.services.verifier import run_verification_review

logger = logging.getLogger(__name__)

router = APIRouter(dependencies=[Depends(verify_api_key)])


# ---------------------------------------------------------------------------
# Admin routes
# ---------------------------------------------------------------------------

@router.get("/admin/stats", tags=["admin"])
async def admin_stats():
    async with get_conn() as conn:
        total_agents = await conn.fetchval("SELECT COUNT(*) FROM agents")
        verified_count = await conn.fetchval("SELECT COUNT(*) FROM agents WHERE verified = TRUE")
        flagged_count = await conn.fetchval(
            "SELECT COUNT(DISTINCT tracent_id) FROM reputation_flags"
        )
        index_rows = await conn.fetch("SELECT source, last_indexed_block FROM index_state")

    return {
        "total_agents": total_agents,
        "verified_count": verified_count,
        "flagged_count": flagged_count,
        "index_state": [dict(r) for r in index_rows],
    }


@router.post("/admin/index", tags=["admin"])
async def admin_trigger_index(background_tasks: BackgroundTasks):
    background_tasks.add_task(ingest_agents, "erc8004")
    return {"status": "indexing started", "source": "erc8004"}


class ReviewBody(BaseModel):
    action: Literal["approve", "reject"]
    reviewer_note: Optional[str] = None


@router.post("/admin/verify/{tracent_id}", tags=["admin"])
async def admin_verify(tracent_id: str, body: ReviewBody):
    async with get_conn() as conn:
        req = await conn.fetchrow(
            """
            SELECT id FROM verification_requests
            WHERE tracent_id = $1 AND status = 'pending'
            ORDER BY submitted_at DESC LIMIT 1
            """,
            tracent_id,
        )
    if not req:
        raise HTTPException(404, f"No pending verification request for {tracent_id}")

    try:
        await run_verification_review(req["id"], body.action, body.reviewer_note or "")
    except LookupError as exc:
        raise HTTPException(404, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))

    return {"request_id": req["id"], "action": body.action, "status": body.action + "d"}


@router.get("/admin/reviews", tags=["admin"])
async def admin_list_reviews():
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT vr.*, a.name AS agent_name
            FROM verification_requests vr
            JOIN agents a ON a.tracent_id = vr.tracent_id
            WHERE vr.status = 'pending'
            ORDER BY vr.submitted_at ASC
            """
        )
    return {"reviews": [dict(r) for r in rows]}


# ---------------------------------------------------------------------------
# Verification request routes (public — auth still required via router dep)
# ---------------------------------------------------------------------------

class VerifyRequestBody(BaseModel):
    tracent_id: str
    requester_email: str


@router.post("/verify/request", tags=["verification"])
async def submit_verification_request(body: VerifyRequestBody):
    async with get_conn() as conn:
        agent = await conn.fetchrow(
            "SELECT tracent_id FROM agents WHERE tracent_id = $1", body.tracent_id
        )
        if not agent:
            raise HTTPException(404, f"Agent {body.tracent_id} not found")

        row = await conn.fetchrow(
            """
            INSERT INTO verification_requests (tracent_id, requester_email)
            VALUES ($1, $2)
            RETURNING id, status
            """,
            body.tracent_id, body.requester_email,
        )
    return {"request_id": row["id"], "status": row["status"]}


@router.get("/verify/status/{tracent_id}", tags=["verification"])
async def verification_status(tracent_id: str):
    async with get_conn() as conn:
        agent = await conn.fetchrow(
            "SELECT verified, trust_tier, verified_at FROM agents WHERE tracent_id = $1",
            tracent_id,
        )
        if not agent:
            raise HTTPException(404, f"Agent {tracent_id} not found")

        latest_request = await conn.fetchrow(
            """
            SELECT id, status, submitted_at, reviewed_at, reviewer_note
            FROM verification_requests
            WHERE tracent_id = $1
            ORDER BY submitted_at DESC LIMIT 1
            """,
            tracent_id,
        )

    result = {
        "tracent_id": tracent_id,
        "verified": agent["verified"],
        "trust_tier": agent["trust_tier"],
        "verified_at": agent["verified_at"],
        "latest_request": dict(latest_request) if latest_request else None,
    }
    return result
