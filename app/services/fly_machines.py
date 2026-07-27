import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_API_BASE = "https://api.machines.dev/v1"
_TIMEOUT = 15.0


def _headers() -> dict:
    if not settings.FLY_API_TOKEN:
        raise RuntimeError("FLY_API_TOKEN is not configured")
    return {"Authorization": f"Bearer {settings.FLY_API_TOKEN}", "Content-Type": "application/json"}


async def create_machine(*, name: str, env: dict[str, str], max_run_seconds: int) -> str:
    """Creates an ephemeral, self-destroying Fly Machine in the sandbox app
    and returns its machine id. The machine runs SANDBOX_IMAGE, which clones
    and executes the agent's repo per the run spec in `env`, then exits --
    auto_destroy tears it down without any further API call needed on the
    happy path. reap_stale_runs() is the backstop for machines that don't."""
    body = {
        "name": name,
        "config": {
            "image": settings.SANDBOX_IMAGE,
            "env": env,
            "guest": {"cpu_kind": "shared", "cpus": 1, "memory_mb": settings.SANDBOX_MEMORY_MB},
            "restart": {"policy": "no"},
            "auto_destroy": True,
            # Backstop kill switch inside the platform itself, independent of
            # our own reaper job -- belt and suspenders against a stuck run.
            "kill_timeout": max_run_seconds + 30,
        },
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_headers()) as client:
        resp = await client.post(f"{_API_BASE}/apps/{settings.FLY_SANDBOX_APP}/machines", json=body)
    resp.raise_for_status()
    return resp.json()["id"]


async def get_machine(machine_id: str) -> dict | None:
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_headers()) as client:
        resp = await client.get(f"{_API_BASE}/apps/{settings.FLY_SANDBOX_APP}/machines/{machine_id}")
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


async def destroy_machine(machine_id: str) -> None:
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=_headers()) as client:
        resp = await client.delete(
            f"{_API_BASE}/apps/{settings.FLY_SANDBOX_APP}/machines/{machine_id}",
            params={"force": "true"},
        )
    if resp.status_code not in (200, 404):
        resp.raise_for_status()
