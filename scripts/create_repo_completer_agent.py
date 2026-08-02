"""
One-off script: create the Genticspace Repo Completer agent on Anthropic's
Managed Agents platform (beta: managed-agents-2026-04-01), and, if
COMPLETION_GITHUB_TOKEN/COMPLETION_GITHUB_ORG are configured, the Vault
credential it uses to push its result.

This agent is a versioned config, created ONCE and reused by ID+version
across every completion run (see app/services/managed_agents.py::
start_completion_run). Do not run this script to "start" a run - it only
defines the reusable agent (and, once, the vault). Re-run it only to change
the prompt/tool config, which bumps the agent's version -- doing so does NOT
recreate the vault if COMPLETION_VAULT_ID is already set in your environment.

Usage:
    python scripts/create_repo_completer_agent.py

After running, put the printed values into Fly secrets:
    fly secrets set --app tracent-registry \\
        COMPLETION_AGENT_ID=agent_... COMPLETION_AGENT_VERSION=1 \\
        COMPLETION_VAULT_ID=vault_...
"""
import anthropic

from app.config import settings

BETA = "managed-agents-2026-04-01"

SYSTEM_PROMPT = """You are the Genticspace Repo Completer. You are given an incomplete
open-source repository (the target) and one or more other, already-vetted
open-source repositories (candidates) mounted alongside it. Your job is to
complete the target by adapting genuinely compatible, useful code from the
candidates into it, then push the result to a new repository, and report
honestly what happened.

The task message you receive will tell you which mounted directory is the
target and which are the candidates, along with each candidate's license and
the destination repository to push the completed result to.

What to do:
1. Read the target's own README/AGENTS.md and existing code first to
   understand what it is trying to be. Never invent functionality the target
   doesn't already suggest it wants.
2. Read each candidate's code for genuinely reusable, compatible pieces --
   same or interoperable language/stack, code that plausibly completes what
   the target is missing. Do not copy code that doesn't fit; a smaller,
   honest completion beats a large, incoherent one.
3. Adapt what you merge in: reconcile naming conventions, dependency
   versions, and architecture differences between target and candidate
   rather than pasting verbatim. Every file you bring in code from must get
   an attribution comment naming the source repository, its license, and
   that it was adapted for this completion.
4. Run whatever tests or checks the resulting repository has. If there are
   none, at minimum confirm the project's own entrypoint/install instructions
   still work after your changes.
5. Stay inside your working directory except for the network calls this task
   explicitly requires (creating and pushing to the destination repository).
   Never fetch or run anything from the network beyond that and whatever the
   target's own declared dependencies require.
6. Create the destination repository via the GitHub API and push your
   completed result to it, using the credential you were given for
   authentication. Use the exact destination name given in your task message.

If you cannot produce a working completion after a few reasonable attempts,
do not keep retrying indefinitely -- report the failure honestly with the
real error, and do not push anything broken.

When you are done (success or failure), end with a final message in exactly
this form so it can be parsed automatically:

COMPLETION_RESULT: succeeded
COMPLETED_REPO_URL: <the destination repository's URL>
<one or two sentences describing what was merged in and from where>

or

COMPLETION_RESULT: failed
<one or two sentences describing what went wrong, in plain language>

Never use em dashes in anything you write."""


def _create_agent(client: anthropic.Anthropic):
    agent = client.beta.agents.create(
        name="genticspace-repo-completer",
        description=(
            "Merges compatible, license-cleared open-source code from candidate "
            "repositories into an incomplete target repository, then pushes the "
            "result, for Genticspace's Repo Completion pipeline. Reused across "
            "every completion run - do not recreate per run."
        ),
        model="claude-opus-5",
        system=SYSTEM_PROMPT,
        tools=[
            {
                "type": "agent_toolset_20260401",
                # Same rationale as the sandbox installer agent:
                # web_fetch/web_search are Anthropic-hosted tools that would
                # bypass the environment's own network allowlist entirely.
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
    return agent


def _create_vault(client: anthropic.Anthropic):
    if not settings.COMPLETION_GITHUB_TOKEN or not settings.COMPLETION_GITHUB_ORG:
        print(
            "COMPLETION_GITHUB_TOKEN/COMPLETION_GITHUB_ORG not set locally - "
            "skipping vault creation. Set them and re-run this script's vault "
            "step later (or create it manually) before running a real completion."
        )
        return None

    vault = client.beta.vaults.create(display_name="genticspace-repo-completion", betas=[BETA])
    client.beta.vaults.credentials.create(
        vault_id=vault.id,
        display_name="COMPLETION_GITHUB_TOKEN",
        auth={
            "type": "environment_variable",
            "secret_name": "COMPLETION_GITHUB_TOKEN",
            "secret_value": settings.COMPLETION_GITHUB_TOKEN,
            "networking": {
                "type": "limited",
                "allowed_hosts": ["github.com", "api.github.com"],
            },
        },
        betas=[BETA],
    )
    return vault


def main() -> None:
    if not settings.ANTHROPIC_API_KEY:
        raise SystemExit("ANTHROPIC_API_KEY is not configured")

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    agent = _create_agent(client)
    print(f"Created agent: {agent.id} (version {agent.version})")

    vault = _create_vault(client)

    print()
    print("Set these on the backend:")
    print(f"  fly secrets set --app tracent-registry COMPLETION_AGENT_ID={agent.id} COMPLETION_AGENT_VERSION={agent.version}", end="")
    if vault:
        print(f" \\\n      COMPLETION_VAULT_ID={vault.id}")
    else:
        print()


if __name__ == "__main__":
    main()
