"""
Thin wrapper around Anthropic's Managed Agents platform (beta), used by the
sandbox AI lane (app/services/sandbox_runner.py) as an alternative to the
manifest-driven Fly Machine lane (app/services/fly_machines.py).

Unlike the Fly lane, there is no custom ingest pipeline here -- our backend
is the client polling this platform's own session events directly
(sync_run, called from sandbox_runner.get_run()), not a machine calling back
into us. See docs on the two-lane split in app/services/sandbox_manifest.py.
"""
import logging

import anthropic

from app.config import settings

logger = logging.getLogger(__name__)

_BETA = "managed-agents-2026-04-01"

# Statuses that mean "the agent is done producing output for now" -- either
# genuinely finished, or idle waiting on a message we're not going to send
# (this is a one-shot install-and-report task, not a conversation).
_THREAD_TERMINAL_TYPES = {
    "session.status_idle",
    "session.status_terminated",
    "session.thread_status_idle",
    "session.thread_status_terminated",
}


def _client() -> anthropic.AsyncAnthropic:
    api_key = settings.SANDBOX_CLAUDE_API_KEY or settings.ANTHROPIC_API_KEY
    if not api_key:
        raise RuntimeError("No Anthropic API key configured for the sandbox AI lane")
    return anthropic.AsyncAnthropic(api_key=api_key)


async def start_ai_run(*, run_id: int, repo_url: str, source_ref: str | None, task_hint: str) -> tuple[str, str]:
    """Creates a fresh Environment + Session for one sandbox run and returns
    (session_id, environment_id). Reuses the one Track-1 installer agent
    (SANDBOX_AGENT_ID/VERSION) -- never creates a new agent per run."""
    if not settings.SANDBOX_AGENT_ID or settings.SANDBOX_AGENT_VERSION is None:
        raise RuntimeError("SANDBOX_AGENT_ID/SANDBOX_AGENT_VERSION not configured")

    client = _client()

    env = await client.beta.environments.create(
        name=f"sandbox-run-{run_id}",
        config={
            "type": "cloud",
            "networking": {
                "type": "limited",
                # Covers pip/npm/etc. without hand-maintaining a host list.
                "allow_package_managers": True,
                "allowed_hosts": [],
            },
        },
        betas=[_BETA],
    )

    resource: dict = {
        "type": "github_repository",
        "url": repo_url,
        "authorization_token": settings.GITHUB_TOKEN or "",
    }
    if source_ref:
        resource["checkout"] = {"type": "branch", "name": source_ref}

    session = await client.beta.sessions.create(
        agent={"type": "agent", "id": settings.SANDBOX_AGENT_ID, "version": settings.SANDBOX_AGENT_VERSION},
        environment_id=env.id,
        resources=[resource],
        initial_events=[{"type": "user.message", "content": [{"type": "text", "text": task_hint}]}],
        betas=[_BETA],
    )
    return session.id, env.id


async def start_completion_run(
    *, run_id: int, target_repo_url: str, candidate_repo_urls: list[str], task_hint: str
) -> tuple[str, str]:
    """Creates an Environment mounting the target repo plus every
    license-cleared candidate repo (each auto-placed at its own mount_path,
    confirmed via the SDK's type stubs -- no collision risk), and a Session
    running the Repo Completion agent (COMPLETION_AGENT_ID/VERSION) against
    them. Unlike start_ai_run, this environment's networking allows
    github.com specifically -- the completion agent needs to `git push` its
    result from a bash-initiated call, not just have repos mounted for it by
    the platform's own resource-mounting step, which is a different network
    path (see the caller for the unverified-until-tested note on whether
    vault credential substitution actually reaches a bash-initiated git push,
    not just SDK-native tool calls -- confirm on a real run before trusting
    this for anything beyond a pilot)."""
    if not settings.COMPLETION_AGENT_ID or settings.COMPLETION_AGENT_VERSION is None:
        raise RuntimeError("COMPLETION_AGENT_ID/COMPLETION_AGENT_VERSION not configured")

    client = _client()

    env = await client.beta.environments.create(
        name=f"completion-run-{run_id}",
        config={
            "type": "cloud",
            "networking": {
                "type": "limited",
                "allow_package_managers": True,
                # github.com for `git push`; api.github.com for creating the
                # destination repo via the REST API first.
                "allowed_hosts": ["github.com", "api.github.com"],
            },
        },
        betas=[_BETA],
    )

    resources: list[dict] = [
        {"type": "github_repository", "url": target_repo_url, "authorization_token": settings.GITHUB_TOKEN or ""}
    ]
    for url in candidate_repo_urls:
        resources.append(
            {"type": "github_repository", "url": url, "authorization_token": settings.GITHUB_TOKEN or ""}
        )

    vault_ids = [settings.COMPLETION_VAULT_ID] if settings.COMPLETION_VAULT_ID else []

    session = await client.beta.sessions.create(
        agent={"type": "agent", "id": settings.COMPLETION_AGENT_ID, "version": settings.COMPLETION_AGENT_VERSION},
        environment_id=env.id,
        resources=resources,
        vault_ids=vault_ids,
        initial_events=[{"type": "user.message", "content": [{"type": "text", "text": task_hint}]}],
        betas=[_BETA],
    )
    return session.id, env.id


def _event_to_log_line(event: dict) -> str | None:
    """Translates one Managed Agents event into a short human-readable log
    line, matching the style RunConsole.tsx already renders for the Fly
    lane. Returns None for event types not worth surfacing."""
    etype = event.get("type")
    if etype == "agent.message":
        parts = event.get("content") or []
        text = "".join(b.get("text", "") for b in parts if isinstance(b, dict) and b.get("type") == "text")
        return text.strip() or None
    if etype == "agent.tool_use" and event.get("name") == "bash":
        command = (event.get("input") or {}).get("command", "")
        return f"$ {command}" if command else None
    if etype == "agent.tool_result":
        parts = event.get("content") or []
        text = "".join(b.get("text", "") for b in parts if isinstance(b, dict) and b.get("type") == "text")
        text = text.strip()
        if not text:
            return None
        # Tool output can be long (a full pip install log); keep the tail,
        # matching what a human skimming a build log actually looks at.
        lines = text.splitlines()
        if len(lines) > 20:
            lines = ["…"] + lines[-20:]
        return "\n".join(lines)
    return None


async def stop_session(session_id: str) -> None:
    client = _client()
    await client.beta.sessions.delete(session_id, betas=[_BETA])


async def _collect_events(session_id: str) -> tuple[list[str], bool]:
    """Shared by sync_run and sync_completion_run: pulls every event for a
    session and translates the ones worth showing into log text, reporting
    whether the session has gone idle/terminated. Sentinel-parsing on top of
    this is caller-specific (different tasks report different result
    shapes), so it stays out of this shared helper."""
    client = _client()
    events = await client.beta.sessions.events.list(session_id, betas=[_BETA])

    lines: list[str] = []
    finished = False
    for event in events.data:
        d = event.model_dump()
        if d.get("type") in _THREAD_TERMINAL_TYPES:
            finished = True
            continue
        line = _event_to_log_line(d)
        if line:
            lines.append(line)
    return lines, finished


async def sync_run(session_id: str) -> dict:
    """Pulls every event for a session, translates the ones worth showing
    into log text, and reports whether the session has gone idle/terminated
    (which we treat as this one-shot task finishing). Called from
    sandbox_runner.get_run() on each poll rather than run in a background
    task -- simplest way to fit the existing 1.5s-poll frontend without new
    infrastructure."""
    lines, finished = await _collect_events(session_id)

    result_status: str | None = None
    result_summary: str | None = None
    for line in lines:
        if "SANDBOX_RESULT:" not in line:
            continue
        for raw in line.splitlines():
            if raw.strip().startswith("SANDBOX_RESULT:"):
                result_status = raw.split(":", 1)[1].strip().lower()
            elif result_status and raw.strip():
                result_summary = raw.strip()

    return {
        "logs": "\n\n".join(lines),
        "finished": finished,
        "result_status": result_status,  # "succeeded" | "failed" | None
        "result_summary": result_summary,
    }


async def sync_completion_run(session_id: str) -> dict:
    """Same event-collection as sync_run, but parses the Repo Completion
    agent's distinct sentinel convention (COMPLETION_RESULT +
    COMPLETED_REPO_URL, see scripts/create_repo_completer_agent.py's system
    prompt) instead of SANDBOX_RESULT -- kept separate from sync_run rather
    than adding a second sentinel to it, so the already-shipped sandbox lane
    (app/services/sandbox_runner.py) isn't touched by this change."""
    lines, finished = await _collect_events(session_id)

    result_status: str | None = None
    completed_repo_url: str | None = None
    result_summary: str | None = None
    for line in lines:
        for raw in line.splitlines():
            stripped = raw.strip()
            if stripped.startswith("COMPLETION_RESULT:"):
                result_status = stripped.split(":", 1)[1].strip().lower()
            elif stripped.startswith("COMPLETED_REPO_URL:"):
                completed_repo_url = stripped.split(":", 1)[1].strip()
            elif result_status and stripped:
                result_summary = stripped

    return {
        "logs": "\n\n".join(lines),
        "finished": finished,
        "result_status": result_status,  # "succeeded" | "failed" | None
        "completed_repo_url": completed_repo_url,
        "result_summary": result_summary,
    }
