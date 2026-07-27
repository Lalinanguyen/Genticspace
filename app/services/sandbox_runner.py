import logging
import secrets
import time
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.db.database import get_conn
from app.services import fly_machines

logger = logging.getLogger(__name__)

_ACTIVE_STATUSES = ("queued", "provisioning", "running")
_TERMINAL_STATUSES = ("succeeded", "failed", "timeout", "canceled")


class SandboxError(Exception):
    """User-facing sandbox error (bad request / not found), mapped to an HTTP
    status by the route layer rather than leaking internals."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


async def _get_agent_and_config(tracent_id: str) -> tuple[dict, dict] | tuple[None, None]:
    async with get_conn() as conn:
        agent = await conn.fetchrow(
            "SELECT tracent_id, name, source_id, github_url FROM agents WHERE tracent_id = $1", tracent_id
        )
        if not agent:
            return None, None
        config = await conn.fetchrow(
            "SELECT * FROM agent_sandbox_config WHERE tracent_id = $1", tracent_id
        )
    return dict(agent), (dict(config) if config else None)


async def list_sandbox_ready_agents() -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT a.* FROM agents a
            JOIN agent_sandbox_config c ON c.tracent_id = a.tracent_id
            WHERE c.sandbox_enabled = TRUE
            ORDER BY a.first_seen DESC
            """
        )
    return [dict(r) for r in rows]


async def get_sandbox_config(tracent_id: str) -> dict:
    agent, config = await _get_agent_and_config(tracent_id)
    if agent is None:
        raise SandboxError("Agent not found", 404)
    return {
        "sandbox_enabled": bool(config and config["sandbox_enabled"]),
        "runtime": config["runtime"] if config else None,
    }


async def _active_run_count(conn, user_id: int) -> int:
    return await conn.fetchval(
        "SELECT COUNT(*) FROM agent_sandbox_runs WHERE user_id = $1 AND status = ANY($2::text[])",
        user_id, list(_ACTIVE_STATUSES),
    )


async def _global_active_run_count(conn) -> int:
    return await conn.fetchval(
        "SELECT COUNT(*) FROM agent_sandbox_runs WHERE status = ANY($1::text[])", list(_ACTIVE_STATUSES)
    )


async def _daily_run_count(conn, user_id: int) -> int:
    return await conn.fetchval(
        "SELECT COUNT(*) FROM agent_sandbox_runs WHERE user_id = $1 AND created_at > NOW() - INTERVAL '1 day'",
        user_id,
    )


def _repo_url(agent: dict) -> str:
    return agent.get("github_url") or f"https://github.com/{agent['source_id']}"


async def _admin_disabled(tracent_id: str) -> bool:
    """The real kill switch behind /admin/sandbox/{tracent_id}/disable
    (app/routes/admin.py). sandbox_cohort is otherwise just an admin-facing
    view over the same sandbox_enabled agents -- this is the one place a
    'disabled' row there actually has to change execution behavior, not
    just what the admin dashboard displays."""
    async with get_conn() as conn:
        status = await conn.fetchval(
            "SELECT status FROM sandbox_cohort WHERE tracent_id = $1", tracent_id
        )
    return status == "disabled"


async def start_run(tracent_id: str, user: dict) -> dict:
    agent, config = await _get_agent_and_config(tracent_id)
    if agent is None:
        raise SandboxError("Agent not found", 404)
    if not config or not config["sandbox_enabled"]:
        raise SandboxError("This agent hasn't been made sandbox-ready yet", 400)
    if await _admin_disabled(tracent_id):
        raise SandboxError("Sandbox access for this agent has been disabled by an admin", 403)

    user_id = user["id"]
    async with get_conn() as conn:
        if await _active_run_count(conn, user_id) >= settings.SANDBOX_MAX_CONCURRENT_PER_USER:
            raise SandboxError("You already have a sandbox run in progress", 429)
        if await _global_active_run_count(conn) >= settings.SANDBOX_GLOBAL_MAX_CONCURRENT:
            raise SandboxError("Sandbox is at capacity right now, try again shortly", 429)
        if await _daily_run_count(conn, user_id) >= settings.SANDBOX_DAILY_RUNS_PER_USER:
            raise SandboxError("Daily sandbox run limit reached", 429)

        ingest_token = secrets.token_urlsafe(32)
        run_id = await conn.fetchval(
            """
            INSERT INTO agent_sandbox_runs (tracent_id, user_id, status, ingest_token, started_at)
            VALUES ($1, $2, 'provisioning', $3, NOW())
            RETURNING id
            """,
            tracent_id, user_id, ingest_token,
        )

    env = {
        "REPO_URL": _repo_url(agent),
        "SOURCE_REF": config["source_ref"] or "main",
        "BUILD_COMMAND": config["build_command"] or "",
        "RUN_COMMAND": config["run_command"],
        "RUNTIME": config["runtime"],
        "RUN_ID": str(run_id),
        "MAX_RUN_SECONDS": str(settings.SANDBOX_MAX_RUN_SECONDS),
        "MAX_LOG_BYTES": str(settings.SANDBOX_MAX_LOG_BYTES),
        "INGEST_URL": f"{settings.SANDBOX_INGEST_BASE_URL}/internal/sandbox/runs/{run_id}/logs",
        "INGEST_TOKEN": ingest_token,
    }

    try:
        machine_id = await fly_machines.create_machine(
            name=f"sandbox-run-{run_id}", env=env, max_run_seconds=settings.SANDBOX_MAX_RUN_SECONDS
        )
    except Exception as exc:
        logger.warning("Failed to provision sandbox machine for run %s: %s", run_id, exc)
        async with get_conn() as conn:
            await conn.execute(
                "UPDATE agent_sandbox_runs SET status = 'failed', finished_at = NOW() WHERE id = $1", run_id
            )
        raise SandboxError("Couldn't start the sandbox run, try again shortly", 503)

    async with get_conn() as conn:
        await conn.execute(
            "UPDATE agent_sandbox_runs SET fly_machine_id = $1 WHERE id = $2", machine_id, run_id
        )

    return {"run_id": run_id, "status": "provisioning"}


async def get_run(run_id: int, user: dict) -> dict:
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM agent_sandbox_runs WHERE id = $1", run_id)
    if not row or row["user_id"] != user["id"]:
        raise SandboxError("Run not found", 404)
    return {
        "run_id": row["id"],
        "status": row["status"],
        "exit_code": row["exit_code"],
        "logs": row["logs"],
        "created_at": row["created_at"],
        "finished_at": row["finished_at"],
    }


async def append_logs(
    run_id: int, token: str, chunk: str, status: str | None = None, exit_code: int | None = None
) -> None:
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM agent_sandbox_runs WHERE id = $1", run_id)
        if not row or not secrets.compare_digest(row["ingest_token"], token):
            raise SandboxError("Invalid run or token", 403)
        if row["status"] in _TERMINAL_STATUSES:
            return

        remaining = max(settings.SANDBOX_MAX_LOG_BYTES - row["log_bytes"], 0)
        truncated_chunk = chunk.encode("utf-8", errors="ignore")[:remaining].decode("utf-8", errors="ignore")
        new_logs = row["logs"] + truncated_chunk
        new_log_bytes = row["log_bytes"] + len(truncated_chunk.encode("utf-8"))

        next_status = status if status in (*_ACTIVE_STATUSES, *_TERMINAL_STATUSES) else row["status"]
        finished = next_status in _TERMINAL_STATUSES

        await conn.execute(
            """
            UPDATE agent_sandbox_runs
            SET logs = $1, log_bytes = $2, status = $3, exit_code = COALESCE($4, exit_code),
                finished_at = CASE WHEN $5 THEN NOW() ELSE finished_at END
            WHERE id = $6
            """,
            new_logs, new_log_bytes, next_status, exit_code, finished, run_id,
        )


async def stop_run(run_id: int, user: dict) -> dict:
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM agent_sandbox_runs WHERE id = $1", run_id)
    if not row or row["user_id"] != user["id"]:
        raise SandboxError("Run not found", 404)
    if row["status"] not in _ACTIVE_STATUSES:
        return {"run_id": run_id, "status": row["status"]}

    if row["fly_machine_id"]:
        try:
            await fly_machines.destroy_machine(row["fly_machine_id"])
        except Exception as exc:
            logger.warning("Failed to destroy sandbox machine for run %s: %s", run_id, exc)

    async with get_conn() as conn:
        await conn.execute(
            "UPDATE agent_sandbox_runs SET status = 'canceled', finished_at = NOW() WHERE id = $1", run_id
        )
    return {"run_id": run_id, "status": "canceled"}


async def reap_stale_runs() -> None:
    """Backstop for runs whose machine never reported a terminal status (crash,
    lost network, killed before it could call the ingest endpoint) -- force-
    destroys the machine and marks the run timed out once it's past its TTL,
    independent of the supervisor's own in-machine timeout."""
    start = time.monotonic()
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=settings.SANDBOX_RUN_TTL_SECONDS)

    async with get_conn() as conn:
        stale = await conn.fetch(
            """
            SELECT id, fly_machine_id FROM agent_sandbox_runs
            WHERE status = ANY($1::text[]) AND created_at < $2
            """,
            list(_ACTIVE_STATUSES), cutoff,
        )

    reaped = 0
    for row in stale:
        if row["fly_machine_id"]:
            try:
                await fly_machines.destroy_machine(row["fly_machine_id"])
            except Exception as exc:
                logger.warning("Failed to destroy stale sandbox machine for run %s: %s", row["id"], exc)
        async with get_conn() as conn:
            await conn.execute(
                "UPDATE agent_sandbox_runs SET status = 'timeout', finished_at = NOW() WHERE id = $1", row["id"]
            )
        reaped += 1

    if reaped:
        logger.info("Sandbox reaper: reaped %d stale run(s), %.1fs", reaped, time.monotonic() - start)
