import logging
from datetime import datetime, timezone

from app.db.database import get_conn
from app.services.endpoint_checker import check_endpoints

logger = logging.getLogger(__name__)


async def run_auto_verification(genticspace_id: str) -> None:
    endpoints_live = await check_endpoints(genticspace_id)

    async with get_conn() as conn:
        agent = await conn.fetchrow(
            "SELECT name, description FROM agents WHERE genticspace_id = $1",
            genticspace_id,
        )
        if not agent:
            logger.warning("run_auto_verification: agent %s not found", genticspace_id)
            return

        transfer_count = await conn.fetchval(
            """
            SELECT COUNT(*) FROM transfer_events
            WHERE genticspace_id = $1 AND is_mint = FALSE
            """,
            genticspace_id,
        )

        has_name = bool(agent["name"])
        has_description = bool(agent["description"])

        risk_score = 0.0
        if transfer_count >= 1:
            risk_score += 0.4
        if transfer_count >= 2:
            risk_score += 0.3
        if not endpoints_live:
            risk_score += 0.2
        if not has_name or not has_description:
            risk_score += 0.1
        risk_score = min(risk_score, 1.0)

        auto_verified = (
            transfer_count == 0
            and endpoints_live
            and has_name
            and has_description
        )
        trust_tier = "onchain" if auto_verified else None
        verified_at = datetime.now(timezone.utc) if auto_verified else None
        safe_to_transact = risk_score < 0.3 and auto_verified

        await conn.execute(
            """
            UPDATE agents SET
                verified         = $1,
                trust_tier       = $2,
                verified_at      = $3,
                risk_score       = $4,
                safe_to_transact = $5
            WHERE genticspace_id = $6
            """,
            auto_verified, trust_tier, verified_at, risk_score, safe_to_transact, genticspace_id,
        )

        await _upsert_flag(conn, genticspace_id, transfer_count >= 1, "ownership_transfer", "high",
                           f"Agent has {transfer_count} ownership transfer(s)")
        await _upsert_flag(conn, genticspace_id, transfer_count >= 2, "rapid_resale", "high",
                           f"Agent has {transfer_count} transfers, possible rapid resale")
        await _upsert_flag(conn, genticspace_id, not endpoints_live, "endpoint_dead", "medium",
                           "No agent endpoints returned HTTP 200")
        await _upsert_flag(conn, genticspace_id, not has_name or not has_description,
                           "schema_invalid", "low",
                           "Agent card missing required fields (name or description)")

    logger.info(
        "Verified %s: risk=%.2f trust_tier=%s safe=%s",
        genticspace_id, risk_score, trust_tier, safe_to_transact,
    )


async def _upsert_flag(conn, genticspace_id: str, condition: bool, flag_type: str,
                       severity: str, detail: str) -> None:
    if condition:
        existing = await conn.fetchrow(
            "SELECT id FROM reputation_flags WHERE genticspace_id = $1 AND flag_type = $2",
            genticspace_id, flag_type,
        )
        if not existing:
            await conn.execute(
                """
                INSERT INTO reputation_flags (genticspace_id, flag_type, severity, detail)
                VALUES ($1, $2, $3, $4)
                """,
                genticspace_id, flag_type, severity, detail,
            )
    else:
        await conn.execute(
            "DELETE FROM reputation_flags WHERE genticspace_id = $1 AND flag_type = $2",
            genticspace_id, flag_type,
        )


async def run_verification_review(request_id: int, action: str, note: str) -> None:
    if action not in ("approve", "reject"):
        raise ValueError(f"Invalid action: {action}")

    async with get_conn() as conn:
        req = await conn.fetchrow(
            "SELECT genticspace_id, status FROM verification_requests WHERE id = $1",
            request_id,
        )
        if not req:
            raise LookupError(f"Verification request {request_id} not found")
        if req["status"] != "pending":
            raise ValueError(f"Request {request_id} is already {req['status']}")

        now = datetime.now(timezone.utc)

        await conn.execute(
            """
            UPDATE verification_requests
            SET status = $1, reviewer_note = $2, reviewed_at = $3
            WHERE id = $4
            """,
            action + "d", note, now, request_id,
        )

        if action == "approve":
            await conn.execute(
                """
                UPDATE agents SET
                    trust_tier  = 'genticspace',
                    verified    = TRUE,
                    verified_at = $1
                WHERE genticspace_id = $2
                """,
                now, req["genticspace_id"],
            )
            logger.info("Genticspace-verified agent %s (request %d)", req["genticspace_id"], request_id)
        else:
            logger.info("Rejected verification request %d for %s", request_id, req["genticspace_id"])
