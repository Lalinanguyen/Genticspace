import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.db.jwt_auth import get_current_user
from app.services import sandbox_runner
from app.services.sandbox_runner import SandboxError

logger = logging.getLogger(__name__)

# User-facing endpoints: JWT-gated like profiles.py, one prefix/tags group.
router = APIRouter(prefix="/public", tags=["sandbox"])

# The sandbox machine's sole permitted callback into Tracent. Deliberately its
# own router (no JWT dependency) -- authed only by the per-run ingest_token
# checked inside append_logs, which is exactly the one thing this endpoint is
# allowed to do.
internal_router = APIRouter(prefix="/internal/sandbox", tags=["sandbox-internal"])


def _handle(exc: SandboxError):
    raise HTTPException(exc.status_code, str(exc))


@router.get("/sandbox/agents")
async def sandbox_ready_agents():
    return {"agents": await sandbox_runner.list_sandbox_ready_agents()}


@router.get("/sandbox/my-trials")
async def my_sandbox_trials(current_user: dict = Depends(get_current_user)):
    return {"trials": await sandbox_runner.list_my_trials(current_user["id"])}


@router.get("/agents/{tracent_id}/sandbox/config")
async def sandbox_config(tracent_id: str):
    try:
        return await sandbox_runner.get_sandbox_config(tracent_id)
    except SandboxError as exc:
        _handle(exc)


@router.post("/agents/{tracent_id}/sandbox/runs")
async def start_sandbox_run(tracent_id: str, current_user: dict = Depends(get_current_user)):
    try:
        return await sandbox_runner.start_run(tracent_id, current_user)
    except SandboxError as exc:
        _handle(exc)


@router.get("/sandbox/runs/{run_id}")
async def get_sandbox_run(run_id: int, current_user: dict = Depends(get_current_user)):
    try:
        return await sandbox_runner.get_run(run_id, current_user)
    except SandboxError as exc:
        _handle(exc)


@router.post("/sandbox/runs/{run_id}/stop")
async def stop_sandbox_run(run_id: int, current_user: dict = Depends(get_current_user)):
    try:
        return await sandbox_runner.stop_run(run_id, current_user)
    except SandboxError as exc:
        _handle(exc)


class LogIngestBody(BaseModel):
    chunk: str = ""
    status: str | None = None
    exit_code: int | None = None


@internal_router.post("/runs/{run_id}/logs")
async def ingest_sandbox_logs(run_id: int, body: LogIngestBody, authorization: str = Header(...)):
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Missing bearer token")
    token = authorization.removeprefix("Bearer ")
    try:
        await sandbox_runner.append_logs(run_id, token, body.chunk, body.status, body.exit_code)
    except SandboxError as exc:
        _handle(exc)
    return {"status": "ok"}
