"""
Task-aware advisory text for Sandbox Mode (see docs re: Track A of Sandbox
Mode) — given a HuggingFace Space's README and a user's free-text task, tells
them what to try in the embedded Space below. This is pure LLM text
generation, modeled directly on app/services/deployment_guide.py's pattern
(same Anthropic client setup, same README-grounded prompting, same
refusal/em-dash handling). It never calls the target agent itself — the
actual "try" is the live iframe embed on the frontend, which runs on
HuggingFace's infrastructure, not ours. No caching: unlike a deployment
guide (per agent + experience level, a small fixed set), a sandbox task
blurb is per agent + arbitrary free-text task, not meaningfully cacheable.
"""
import logging

import anthropic

from app.config import settings
from app.db.database import get_conn
from app.services.agent_queries import compute_sandbox_fields

logger = logging.getLogger(__name__)

_MAX_README_CHARS_FOR_PROMPT = 8000
_MAX_TASK_CHARS = 500

_SYSTEM_PROMPT = """You are a quick guide for Genticspace's Sandbox Mode, a live embedded HuggingFace Space the user can try directly on Genticspace, an AI agent marketplace. You're given the Space's README (if any) and the user's stated task. In 2-4 sentences, tell them specifically what to try in the embedded Space below to accomplish that task, using ONLY real inputs, fields, or capabilities you can actually confirm from the README. If the README doesn't give you enough to point at specific controls, say so plainly and suggest exploring the embedded app's interface directly rather than guessing at field names or steps that might not exist. Never invent capabilities, inputs, or outputs the README doesn't support. No preamble like "Based on the README". Never use em dashes (—); use a comma, period, or colon instead."""


async def _get_sandboxable_agent(tracent_id: str) -> dict:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT tracent_id, name, source, source_id, license, readme_text
            FROM agents WHERE tracent_id = $1
            """,
            tracent_id,
        )
    if row is None:
        raise LookupError(f"Agent {tracent_id} not found")

    agent = dict(row)
    compute_sandbox_fields(agent)
    if not agent["sandboxable"]:
        raise ValueError(f"Agent {tracent_id} is not sandboxable")
    return agent


async def get_sandbox_task_guidance(tracent_id: str, task: str) -> str:
    # Check eligibility (LookupError/ValueError -> 404 at the route level)
    # before the API-key check (RuntimeError -> 503) — an agent that isn't
    # sandboxable should 404 regardless of whether the LLM is configured,
    # not be masked by an unrelated 503.
    agent = await _get_sandboxable_agent(tracent_id)

    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    task = task.strip()[:_MAX_TASK_CHARS]
    user_content = f"Agent name: {agent.get('name') or agent['tracent_id']}\nUser's task: {task}"
    readme_text = agent.get("readme_text")
    if readme_text:
        user_content += f"\n\nREADME:\n{readme_text[:_MAX_README_CHARS_FOR_PROMPT]}"
    else:
        user_content += "\n\n(No README indexed for this agent.)"

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    response = await client.messages.create(
        model="claude-opus-4-8",
        max_tokens=400,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    if response.stop_reason == "refusal":
        logger.warning("Sandbox task guidance refused for %s", tracent_id)
        return "We couldn't generate task-specific guidance for this one. Try exploring the embedded app directly below."

    text = next((b.text for b in response.content if b.type == "text"), "")
    text = text.replace("—", ", ")
    return text.strip() or "No guidance could be generated. Try exploring the embedded app directly below."
