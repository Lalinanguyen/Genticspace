import base64
import logging
import time

import httpx
import yaml

from app.config import settings
from app.db.database import get_conn
from app.services.github_analysis import github_headers, github_rate_limit_wait

logger = logging.getLogger(__name__)

_API_BASE = "https://api.github.com"
_TIMEOUT = 10.0

# Checked in order; the first one present in the repo wins. A manifest gets
# a repo onto the fast, free, deterministic Fly Machine lane, running exactly
# the literal commands it declares. Repos without one aren't excluded --
# they fall to the slower Managed Agents lane instead (see
# scan_sandbox_manifests below), which doesn't need a pre-declared command
# because it never guesses and runs a literal string; it reads the repo's own
# docs and figures it out live, sandboxed, the way a person would.
_MANIFEST_PATHS = ["genticspace.yaml", "genticspace.yml", ".genticspace/sandbox.yaml"]

_VALID_RUNTIMES = {"python", "node"}


def _validate_manifest(data: dict) -> dict | None:
    if not isinstance(data, dict):
        return None
    runtime = data.get("runtime")
    run_command = data.get("run")
    if runtime not in _VALID_RUNTIMES or not isinstance(run_command, str) or not run_command.strip():
        return None
    build_command = data.get("build")
    if build_command is not None and not isinstance(build_command, str):
        return None
    entrypoint = data.get("entrypoint")
    if entrypoint is not None and not isinstance(entrypoint, str):
        return None
    port = data.get("port")
    if port is not None and not isinstance(port, int):
        return None
    return {
        "runtime": runtime,
        "build_command": build_command,
        "run_command": run_command.strip(),
        "entrypoint": entrypoint,
        "default_port": port,
    }


async def _get_candidate_agents() -> list[dict]:
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT a.tracent_id, a.source_id, a.readme_text
            FROM agents a
            LEFT JOIN agent_sandbox_config c ON c.tracent_id = a.tracent_id
            WHERE a.source = 'github'
              AND (
                    c.tracent_id IS NULL
                 OR c.manifest_fetched_at IS NULL
                 OR c.manifest_fetched_at < NOW() - INTERVAL '1 hour' * $1
              )
            ORDER BY c.manifest_fetched_at ASC NULLS FIRST
            LIMIT $2
            """,
            settings.SANDBOX_MANIFEST_SCAN_INTERVAL_HOURS,
            settings.SANDBOX_MANIFEST_SCAN_BATCH_SIZE,
        )
    return [dict(r) for r in rows]


async def _get_default_branch(client: httpx.AsyncClient, full_name: str) -> tuple[str | None, float | None]:
    try:
        resp = await client.get(f"{_API_BASE}/repos/{full_name}")
    except Exception as exc:
        logger.debug("Repo lookup failed for %s: %s", full_name, exc)
        return None, None
    wait = github_rate_limit_wait(resp)
    if wait is not None:
        return None, wait
    if resp.status_code != 200:
        return None, None
    return resp.json().get("default_branch") or "main", None


async def _fetch_manifest(
    client: httpx.AsyncClient, full_name: str, ref: str
) -> tuple[dict | None, str | None, float | None]:
    """Returns (parsed_manifest, manifest_path, rate_limit_wait_seconds)."""
    for path in _MANIFEST_PATHS:
        try:
            resp = await client.get(f"{_API_BASE}/repos/{full_name}/contents/{path}", params={"ref": ref})
        except Exception as exc:
            logger.debug("Manifest fetch failed for %s/%s: %s", full_name, path, exc)
            continue

        wait = github_rate_limit_wait(resp)
        if wait is not None:
            return None, None, wait
        if resp.status_code != 200:
            continue

        data = resp.json()
        if data.get("encoding") != "base64":
            continue
        try:
            raw = base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
            parsed = yaml.safe_load(raw)
        except Exception as exc:
            logger.debug("Manifest parse failed for %s/%s: %s", full_name, path, exc)
            continue

        validated = _validate_manifest(parsed)
        if validated:
            return validated, path, None

    return None, None, None


async def _save_config(
    tracent_id: str, manifest: dict | None, ref: str | None, manifest_path: str | None, ai_eligible: bool = False
) -> None:
    # sandbox_enabled=True with run_command=NULL is the AI-lane signal
    # (app/services/sandbox_runner.py branches on run_command IS NULL) --
    # a repo with real README material but no genticspace.yaml, run through
    # the Managed Agents installer instead of a literal command.
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO agent_sandbox_config (
                tracent_id, sandbox_enabled, runtime, source_ref,
                build_command, run_command, entrypoint, default_port,
                manifest_path, manifest_fetched_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            ON CONFLICT (tracent_id) DO UPDATE SET
                sandbox_enabled     = EXCLUDED.sandbox_enabled,
                runtime             = EXCLUDED.runtime,
                source_ref          = EXCLUDED.source_ref,
                build_command       = EXCLUDED.build_command,
                run_command         = EXCLUDED.run_command,
                entrypoint          = EXCLUDED.entrypoint,
                default_port        = EXCLUDED.default_port,
                manifest_path       = EXCLUDED.manifest_path,
                manifest_fetched_at = NOW(),
                updated_at          = NOW()
            """,
            tracent_id,
            manifest is not None or ai_eligible,
            (manifest or {}).get("runtime"),
            ref,
            (manifest or {}).get("build_command"),
            (manifest or {}).get("run_command"),
            (manifest or {}).get("entrypoint"),
            (manifest or {}).get("default_port"),
            manifest_path,
        )


async def scan_sandbox_manifests() -> None:
    """Looks for a genticspace.yaml manifest in each GitHub-sourced agent's repo
    and enables/refreshes sandbox mode for it when one validates -- the fast,
    free, deterministic lane (app/services/sandbox_runner.py runs the literal
    build/run commands via a Fly Machine). Repos without a manifest but with
    real README material still become sandbox_enabled, for the slower,
    Managed-Agents-driven AI lane (SANDBOX_AI_ENABLED) that installs/runs the
    repo the way a person reading its docs would, instead of guessing a
    command. Agents with neither are recorded too (sandbox_enabled=False,
    manifest_fetched_at set) so they aren't re-checked on every scan pass,
    same has_material pattern as deployment_guide.py's placeholder caching."""
    start = time.monotonic()
    agents = await _get_candidate_agents()
    manifest_enabled = 0
    ai_enabled = 0
    skipped = 0
    rate_limited = False

    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=github_headers(), follow_redirects=True) as client:
        for agent in agents:
            full_name = agent["source_id"]
            has_readme = bool((agent.get("readme_text") or "").strip())
            branch, wait = await _get_default_branch(client, full_name)
            if wait is not None:
                rate_limited = True
                break
            if branch is None:
                await _save_config(agent["tracent_id"], None, None, None, ai_eligible=False)
                skipped += 1
                continue

            manifest, path, wait = await _fetch_manifest(client, full_name, branch)
            if wait is not None:
                rate_limited = True
                break

            await _save_config(agent["tracent_id"], manifest, branch, path, ai_eligible=has_readme)
            if manifest:
                manifest_enabled += 1
            elif has_readme:
                ai_enabled += 1
            else:
                skipped += 1

    elapsed = time.monotonic() - start
    logger.info(
        "Sandbox manifest scan complete: %d manifest-enabled, %d AI-lane-enabled, %d skipped, %.1fs%s",
        manifest_enabled, ai_enabled, skipped, elapsed, " [rate limited]" if rate_limited else "",
    )
