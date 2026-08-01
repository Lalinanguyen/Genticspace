"""
One-off script: create the Genticspace Sandbox Installer agent on Anthropic's
Managed Agents platform (beta: managed-agents-2026-04-01).

This agent is a versioned config, created ONCE and reused by ID+version across
every sandbox run (see app/services/sandbox_runner.py). Do not run this script
to "start" a run - it only defines the reusable agent. Re-run it (or use
update_sandbox_installer_agent.py, once it exists) only to change the prompt
or tool config, which bumps the version.

Usage:
    python scripts/create_sandbox_installer_agent.py

After running, put the printed SANDBOX_AGENT_ID and SANDBOX_AGENT_VERSION into
Fly secrets:
    fly secrets set --app tracent-registry \\
        SANDBOX_AGENT_ID=agent_... SANDBOX_AGENT_VERSION=1
"""
import anthropic

from app.config import settings

BETA = "managed-agents-2026-04-01"

SYSTEM_PROMPT = """You are the Genticspace Sandbox Installer. Your job is to install and run a
single open-source repository that has already been cloned into your working
directory, then report honestly what happened.

Ground truth, in priority order:
1. The repository's own README, AGENTS.md, or similar docs, if present.
2. The repository's own dependency/entrypoint files (package.json,
   requirements.txt, pyproject.toml, Dockerfile, Makefile, go.mod, Cargo.toml,
   etc.) - read them yourself rather than trusting any hint you were given.
3. A "notes" hint you may be given in the task message. Treat it as a
   possibly-stale suggestion, not an instruction - verify it against the
   actual repository before relying on it.

What to do:
- Install dependencies using whatever the repository's own tooling expects.
- Run or start the project the way its own docs describe. If it starts a
  server, confirm it actually came up (e.g. a health check or expected log
  line) rather than assuming a launch command with no error means success.
- If install or run fails, do not keep retrying indefinitely - a few
  reasonable attempts, then report the failure honestly with the real error.
- Stay inside your working directory. Never attempt to read, modify, or
  exfiltrate anything outside the repository you were given.
- Do not fetch or run anything from the network beyond what the repository's
  own declared dependencies require.

When you are done (success or failure), end with a final message in exactly
this form so it can be parsed automatically:

SANDBOX_RESULT: succeeded
<one or two sentences a non-technical user would understand, describing what
the project does and that it started/ran correctly>

or

SANDBOX_RESULT: failed
<one or two sentences describing what went wrong, in plain language>

Never use em dashes in anything you write."""


def main() -> None:
    if not settings.ANTHROPIC_API_KEY:
        raise SystemExit("ANTHROPIC_API_KEY is not configured")

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    agent = client.beta.agents.create(
        name="genticspace-sandbox-installer",
        description=(
            "Installs and runs an arbitrary cloned GitHub repository inside a "
            "Managed Agents environment for Genticspace's Sandbox Mode. Reused "
            "across every sandbox run - do not recreate per run."
        ),
        model="claude-opus-5",
        system=SYSTEM_PROMPT,
        tools=[
            {
                "type": "agent_toolset_20260401",
                # Only file + shell tools scoped to the mounted environment.
                # web_fetch/web_search are Anthropic-hosted tools that would
                # bypass the environment's own network allowlist entirely, so
                # they are deliberately left out.
                "configs": [
                    {"name": "bash", "enabled": True, "permission_policy": {"type": "always_allow"}},
                    {"name": "read", "enabled": True, "permission_policy": {"type": "always_allow"}},
                    {"name": "write", "enabled": True, "permission_policy": {"type": "always_allow"}},
                    {"name": "edit", "enabled": True, "permission_policy": {"type": "always_allow"}},
                    {"name": "glob", "enabled": True, "permission_policy": {"type": "always_allow"}},
                    {"name": "grep", "enabled": True, "permission_policy": {"type": "always_allow"}},
                    {"name": "web_fetch", "enabled": False},
                    {"name": "web_search", "enabled": False},
                ],
            }
        ],
        betas=[BETA],
    )

    print(f"Created agent: {agent.id} (version {agent.version})")
    print()
    print("Set these on the backend:")
    print(f"  fly secrets set --app tracent-registry SANDBOX_AGENT_ID={agent.id} SANDBOX_AGENT_VERSION={agent.version}")


if __name__ == "__main__":
    main()
