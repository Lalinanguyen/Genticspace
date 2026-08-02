"""
Repo Completion pipeline, Phase 2 pilot: on-demand script, not a scheduled
job (see the approved plan -- promoting this to automatic is a real decision
for later). For each thin/incomplete already-scraped listing, finds
compatible already-scraped candidates, keeps only permissively-licensed
ones, runs a real Managed Agents completion session, and leaves the result
in `completed_pending_review` -- nothing is published to the public `agents`
table by this script. Use the admin publish endpoint after reviewing.

Usage:
    PYTHONPATH=. python scripts/run_repo_completion_pilot.py --limit 5
"""
import argparse
import asyncio
import json
import logging
import time

from app.config import settings
from app.db.database import close_db, get_conn, init_db
from app.services.managed_agents import start_completion_run, sync_completion_run
from app.services.repo_completion_pipeline import (
    find_candidates,
    judge_compatibility,
    license_gate,
    owner_repo_from_github_url,
    select_completion_targets,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 5
_POLL_TIMEOUT_SECONDS = settings.COMPLETION_MAX_RUN_SECONDS


async def _run_one_target(target: dict) -> None:
    tracent_id = target["tracent_id"]
    logger.info("Target: %s (%s)", tracent_id, target.get("name") or target.get("source_id"))

    async with get_conn() as conn:
        request_id = await conn.fetchval(
            "INSERT INTO repo_completion_requests (tracent_id, status) VALUES ($1, 'queued') RETURNING id",
            tracent_id,
        )

    candidates = await find_candidates(target)
    if not candidates:
        logger.info("  no textually-similar candidates found, skipping")
        await _set_status(request_id, "no_permissive_candidate")
        return

    picks = await judge_compatibility(target, candidates)
    if not picks:
        logger.info("  Claude found no genuinely compatible candidates, skipping")
        await _set_status(request_id, "no_permissive_candidate")
        return

    permissive_picks = await license_gate(picks)
    await _record_sources(request_id, picks)
    if not permissive_picks:
        logger.info("  %d candidate(s) picked, none permissively licensed, skipping", len(picks))
        await _set_status(request_id, "no_permissive_candidate")
        return

    logger.info(
        "  merging %d permissive candidate(s): %s",
        len(permissive_picks), ", ".join(p["tracent_id"] for p in permissive_picks),
    )

    destination_repo = f"{settings.COMPLETION_GITHUB_ORG}/{target['source_id'].split('/')[-1]}-completed"
    task_hint = _build_task_hint(target, permissive_picks, destination_repo)

    try:
        session_id, environment_id = await start_completion_run(
            run_id=request_id,
            target_repo_url=target["github_url"] or f"https://github.com/{target['source_id']}",
            candidate_repo_urls=[
                p["github_url"] or f"https://github.com/{p['source_id']}" for p in permissive_picks
            ],
            task_hint=task_hint,
        )
    except Exception as exc:
        logger.warning("  failed to start completion run: %s", exc)
        await _set_status(request_id, "failed")
        return

    async with get_conn() as conn:
        await conn.execute(
            "UPDATE repo_completion_requests SET status = 'running', session_id = $1, environment_id = $2, updated_at = NOW() WHERE id = $3",
            session_id, environment_id, request_id,
        )

    result = await _poll_until_finished(session_id)
    await _finish_request(request_id, tracent_id, result, permissive_picks)


async def _set_status(request_id: int, status: str) -> None:
    async with get_conn() as conn:
        await conn.execute(
            "UPDATE repo_completion_requests SET status = $1, updated_at = NOW() WHERE id = $2",
            status, request_id,
        )


async def _record_sources(request_id: int, picks: list[dict]) -> None:
    async with get_conn() as conn:
        for pick in picks:
            await conn.execute(
                """
                INSERT INTO repo_completion_sources
                    (request_id, repo_url, license_spdx_id, license_classification, license_classified_at, status)
                VALUES ($1, $2, $3, $4, NOW(), $5)
                """,
                request_id,
                pick["github_url"] or f"https://github.com/{pick['source_id']}",
                pick.get("license_spdx_id"), pick.get("license_classification"),
                "approved" if pick.get("license_classification") == "permissive" else "rejected",
            )


def _build_task_hint(target: dict, picks: list[dict], destination_repo: str) -> str:
    candidate_lines = "\n".join(
        f"- {p.get('name') or p['source_id']} (license: {p.get('license_classification')}, "
        f"reason it was picked: {p.get('compatibility_reason', 'n/a')})"
        for p in picks
    )
    owner = settings.COMPLETION_GITHUB_ORG
    repo_name = destination_repo.split("/", 1)[1]
    if settings.COMPLETION_GITHUB_OWNER_TYPE == "org":
        create_instructions = (
            f"Create it via POST https://api.github.com/orgs/{owner}/repos "
            f"with JSON body {{\"name\": \"{repo_name}\", \"private\": true}} -- "
            f"{owner} is a GitHub Organization, not a personal account."
        )
    else:
        create_instructions = (
            f"Create it via POST https://api.github.com/user/repos "
            f"with JSON body {{\"name\": \"{repo_name}\", \"private\": true}} -- "
            f"{owner} is a personal GitHub account, not an Organization, so the "
            f"org-scoped repo-creation endpoint will not work here."
        )
    return (
        f"The target repository (incomplete, needs completion) is mounted at "
        f"/workspace/{target['source_id'].split('/')[-1]}.\n\n"
        f"The following candidate repositories are also mounted, each at "
        f"/workspace/<their-repo-name>, all confirmed permissively licensed and "
        f"cleared to adapt code from with attribution:\n{candidate_lines}\n\n"
        f"When you push your completed result: {create_instructions} Authenticate "
        f"using the COMPLETION_GITHUB_TOKEN credential you were given (as a Bearer "
        f"token for the creation request, and as the password in the HTTPS git "
        f"remote URL for the push, e.g. "
        f"https://x-access-token:${{COMPLETION_GITHUB_TOKEN}}@github.com/{destination_repo}.git). "
        f"Then push your completed branch to it."
    )


async def _poll_until_finished(session_id: str) -> dict:
    deadline = time.monotonic() + _POLL_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        result = await sync_completion_run(session_id)
        if result["finished"]:
            return result
        await asyncio.sleep(_POLL_INTERVAL_SECONDS)
    logger.warning("  session %s timed out after %ds without finishing", session_id, _POLL_TIMEOUT_SECONDS)
    return {"finished": False, "result_status": None, "completed_repo_url": None}


async def _finish_request(request_id: int, tracent_id: str, result: dict, permissive_picks: list[dict]) -> None:
    if result.get("result_status") == "succeeded" and result.get("completed_repo_url"):
        status = "completed_pending_review"
        logger.info("  completed: %s", result["completed_repo_url"])
        manifest = [
            {
                "source_repo_url": p["github_url"] or f"https://github.com/{p['source_id']}",
                "license_classification": p.get("license_classification"),
                "consent_record_id": None,
            }
            for p in permissive_picks
        ]
        async with get_conn() as conn:
            await conn.execute(
                """
                INSERT INTO provenance_manifests (tracent_id, manifest, generated_at)
                VALUES ($1, $2::jsonb, NOW())
                ON CONFLICT (tracent_id) DO UPDATE SET manifest = $2::jsonb, generated_at = NOW()
                """,
                tracent_id, json.dumps(manifest),
            )
    else:
        status = "failed"
        logger.warning("  did not complete successfully: %s", result.get("result_summary") or "no result reported")

    async with get_conn() as conn:
        await conn.execute(
            "UPDATE repo_completion_requests SET status = $1, completed_repo_url = $2, updated_at = NOW() WHERE id = $3",
            status, result.get("completed_repo_url"), request_id,
        )


async def main(limit: int) -> None:
    await init_db()
    try:
        if not settings.COMPLETION_AGENT_ID or settings.COMPLETION_AGENT_VERSION is None:
            raise SystemExit(
                "COMPLETION_AGENT_ID/COMPLETION_AGENT_VERSION not configured -- "
                "run scripts/create_repo_completer_agent.py first."
            )
        if not settings.COMPLETION_GITHUB_ORG:
            raise SystemExit("COMPLETION_GITHUB_ORG not configured -- nowhere to push completed repos to.")

        targets = await select_completion_targets(limit=limit)
        logger.info("Selected %d target(s)", len(targets))
        for target in targets:
            await _run_one_target(target)
    finally:
        await close_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=5)
    args = parser.parse_args()
    asyncio.run(main(args.limit))
