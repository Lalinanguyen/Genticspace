import logging
from datetime import datetime, timezone

import anthropic

from app.config import settings
from app.db.database import get_conn

logger = logging.getLogger(__name__)

_VALID_LEVELS = {"Beginner", "Intermediate", "Advanced"}
_DEFAULT_LEVEL = "Intermediate"
_MAX_README_CHARS_FOR_PROMPT = 12000

_SYSTEM_PROMPT = """You are a technical writer for Tracent, an AI agent marketplace. You are given the raw README of a GitHub repository for an AI agent, along with the user's stated AI experience level. Write clear installation and deployment instructions based ONLY on what is actually present in the README — never invent commands, prerequisites, or steps that aren't there. If the README doesn't contain enough information to actually deploy the agent, say so plainly rather than guessing or padding with generic advice.

Tailor depth and vocabulary to the stated experience level:
- Beginner: spell out every step, assume no prior familiarity with package managers, environment variables, virtual environments, or the command line. Briefly explain what each command does before showing it.
- Intermediate: concise numbered steps, standard terminology, no hand-holding.
- Advanced: just the commands and key configuration/environment variables, minimal prose.

Format the response as markdown with clear section headers (e.g. Prerequisites, Installation, Configuration, Running/Deployment). Never use em dashes (—) anywhere in the response; use a comma, period, or colon instead."""


def _normalize_level(level: str | None) -> str:
    return level if level in _VALID_LEVELS else _DEFAULT_LEVEL


async def _get_agent(tracent_id: str) -> dict | None:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT tracent_id, name, web_endpoint, readme_text, readme_fetched_at
            FROM agents WHERE tracent_id = $1
            """,
            tracent_id,
        )
    return dict(row) if row else None


async def _get_cached_guide(tracent_id: str, experience_level: str) -> dict | None:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM agent_deployment_guides WHERE tracent_id = $1 AND experience_level = $2",
            tracent_id, experience_level,
        )
    return dict(row) if row else None


async def _save_guide(tracent_id: str, experience_level: str, instructions: str, readme_fetched_at) -> None:
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO agent_deployment_guides (tracent_id, experience_level, instructions, readme_fetched_at, generated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (tracent_id, experience_level) DO UPDATE SET
                instructions      = EXCLUDED.instructions,
                readme_fetched_at = EXCLUDED.readme_fetched_at,
                generated_at      = NOW()
            """,
            tracent_id, experience_level, instructions, readme_fetched_at,
        )


async def _generate(agent: dict, experience_level: str) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    user_content = (
        f"Agent name: {agent.get('name') or agent['tracent_id']}\n"
        f"Repository: {agent.get('web_endpoint') or 'unknown'}\n"
        f"User experience level: {experience_level}\n\n"
        f"README content:\n{(agent.get('readme_text') or '')[:_MAX_README_CHARS_FOR_PROMPT]}"
    )

    response = await client.messages.create(
        model="claude-opus-4-8",
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    if response.stop_reason == "refusal":
        logger.warning("Deployment guide generation refused for %s", agent["tracent_id"])
        return "We couldn't generate deployment instructions for this agent right now. Check the repository's README directly."

    text = next((b.text for b in response.content if b.type == "text"), "")
    text = text.replace("—", ", ")
    return text.strip() or "No instructions could be generated from this agent's README."


async def get_or_generate_deployment_guide(
    tracent_id: str, experience_level: str | None, force: bool = False
) -> dict:
    level = _normalize_level(experience_level)

    agent = await _get_agent(tracent_id)
    if agent is None:
        raise LookupError(f"Agent {tracent_id} not found")

    if not agent.get("readme_text"):
        return {
            "instructions": (
                "No README has been indexed for this agent yet. Check back after the next "
                "scrape, or visit the repository directly."
            ),
            "generated_at": None,
            "cached": False,
            "has_readme": False,
        }

    if not force:
        cached = await _get_cached_guide(tracent_id, level)
        if cached and cached["readme_fetched_at"] == agent["readme_fetched_at"]:
            return {
                "instructions": cached["instructions"],
                "generated_at": cached["generated_at"],
                "cached": True,
                "has_readme": True,
            }

    instructions = await _generate(agent, level)
    await _save_guide(tracent_id, level, instructions, agent["readme_fetched_at"])

    return {
        "instructions": instructions,
        "generated_at": datetime.now(timezone.utc),
        "cached": False,
        "has_readme": True,
    }
