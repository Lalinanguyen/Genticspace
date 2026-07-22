import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from app.db.auth import verify_api_key
from app.db.database import get_conn
from app.services.trust_summary import compute_trust_summary

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trust", tags=["trust"], dependencies=[Depends(verify_api_key)])


async def _build_trust_response(genticspace_id: str) -> dict:
    async with get_conn() as conn:
        agent = await conn.fetchrow(
            """
            SELECT genticspace_id, source, source_id, name,
                   verified, trust_tier, risk_score, safe_to_transact, endpoints_live
            FROM agents WHERE genticspace_id = $1
            """,
            genticspace_id,
        )
        if not agent:
            raise HTTPException(404, f"Agent {genticspace_id} not found")

        ownership_transfers = await conn.fetchval(
            "SELECT COUNT(*) FROM transfer_events WHERE genticspace_id = $1 AND is_mint = FALSE",
            genticspace_id,
        )
        flags = await conn.fetch(
            "SELECT flag_type, severity, detail FROM reputation_flags WHERE genticspace_id = $1",
            genticspace_id,
        )

    has_high_flag = any(f["severity"] == "high" for f in flags)

    return {
        "genticspace_id": agent["genticspace_id"],
        "source": agent["source"],
        "source_id": agent["source_id"],
        "name": agent["name"],
        "verified": agent["verified"],
        "trust_tier": agent["trust_tier"],
        "risk_score": agent["risk_score"],
        "safe_to_transact": agent["safe_to_transact"],
        "endpoints_live": agent["endpoints_live"],
        "trust_summary": compute_trust_summary(
            trust_tier=agent["trust_tier"],
            verified=bool(agent["verified"]),
            has_high_severity_flag=has_high_flag,
        ),
        "ownership_transfers": ownership_transfers,
        "flags": [dict(f) for f in flags],
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/source/{source}/{source_id}")
async def trust_by_source(source: str, source_id: str):
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT genticspace_id FROM agents WHERE source = $1 AND source_id = $2",
            source, source_id,
        )
    if not row:
        raise HTTPException(404, f"Agent not found for source={source} source_id={source_id}")
    return await _build_trust_response(row["genticspace_id"])


@router.get("/{genticspace_id}")
async def trust_by_id(genticspace_id: str):
    return await _build_trust_response(genticspace_id)
