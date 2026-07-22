import logging
import re
from datetime import datetime, timezone

import anthropic
import httpx

from app.config import settings
from app.db.database import get_conn

logger = logging.getLogger(__name__)

_VALID_LEVELS = {"Beginner", "Intermediate", "Advanced"}
_DEFAULT_LEVEL = "Intermediate"
_MAX_README_CHARS_FOR_PROMPT = 12000
_MAX_WEBSITE_CHARS_FOR_PROMPT = 6000
_WEBSITE_FETCH_TIMEOUT = 8.0

_SCRIPT_STYLE_RE = re.compile(r"<(script|style)[^>]*>.*?</\1>", re.IGNORECASE | re.DOTALL)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"[ \t]+")
_BLANK_LINES_RE = re.compile(r"\n\s*\n+")
_HTML_ENTITIES = {
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
    "&nbsp;": " ", "&rsquo;": "'", "&lsquo;": "'", "&rdquo;": '"', "&ldquo;": '"', "&mdash;": ",",
}

_SYSTEM_PROMPT = """You are a technical writer for Genticspace, an AI agent marketplace. You are given whatever real source material is available for an AI agent (a GitHub/Hugging Face README, and/or text scraped from its website), along with the user's stated AI experience level. Write clear installation and deployment instructions based ONLY on what is actually present in that material — never invent commands, prerequisites, pricing, or steps that aren't there. Different sources may cover different things (e.g. the README has install commands, the website has pricing/signup info) — synthesize across whatever is given rather than picking just one. If the material doesn't contain enough information to actually deploy or start using the agent, say so plainly rather than guessing or padding with generic advice.

Tailor depth and vocabulary to the stated experience level:
- Beginner: spell out every step, assume no prior familiarity with package managers, environment variables, virtual environments, or the command line. Briefly explain what each command does before showing it.
- Intermediate: concise numbered steps, standard terminology, no hand-holding.
- Advanced: just the commands and key configuration/environment variables, minimal prose.

Format the response as markdown with clear section headers (e.g. Prerequisites, Installation, Configuration, Running/Deployment). Never use em dashes (—) anywhere in the response; use a comma, period, or colon instead."""


def _normalize_level(level: str | None) -> str:
    return level if level in _VALID_LEVELS else _DEFAULT_LEVEL


def _html_to_text(html: str) -> str:
    text = _SCRIPT_STYLE_RE.sub(" ", html)
    text = _TAG_RE.sub(" ", text)
    for entity, replacement in _HTML_ENTITIES.items():
        text = text.replace(entity, replacement)
    text = re.sub(r"&#x([0-9a-fA-F]+);", lambda m: chr(int(m.group(1), 16)), text)
    text = re.sub(r"&#(\d+);", lambda m: chr(int(m.group(1))), text)
    text = _WHITESPACE_RE.sub(" ", text)
    lines = [line.strip() for line in text.split("\n")]
    text = "\n".join(line for line in lines if line)
    return _BLANK_LINES_RE.sub("\n", text).strip()


async def _fetch_website_text(url: str | None) -> str | None:
    if not url:
        return None
    try:
        async with httpx.AsyncClient(timeout=_WEBSITE_FETCH_TIMEOUT, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "GenticspaceBot/1.0 (+https://genticspace.com)"})
        if resp.status_code != 200 or "text/html" not in resp.headers.get("content-type", ""):
            return None
        text = _html_to_text(resp.text)
        return text[:_MAX_WEBSITE_CHARS_FOR_PROMPT] if text else None
    except Exception as exc:
        logger.debug("Website fetch failed for %s: %s", url, exc)
        return None


async def _get_agent(genticspace_id: str) -> dict | None:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT genticspace_id, name, web_endpoint, github_url, huggingface_url,
                   readme_text, readme_fetched_at
            FROM agents WHERE genticspace_id = $1
            """,
            genticspace_id,
        )
    return dict(row) if row else None


async def _get_cached_guide(genticspace_id: str, experience_level: str) -> dict | None:
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM agent_deployment_guides WHERE genticspace_id = $1 AND experience_level = $2",
            genticspace_id, experience_level,
        )
    return dict(row) if row else None


async def _save_guide(genticspace_id: str, experience_level: str, instructions: str, readme_fetched_at) -> None:
    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO agent_deployment_guides (genticspace_id, experience_level, instructions, readme_fetched_at, generated_at)
            VALUES ($1, $2, $3, $4, NOW())
            ON CONFLICT (genticspace_id, experience_level) DO UPDATE SET
                instructions      = EXCLUDED.instructions,
                readme_fetched_at = EXCLUDED.readme_fetched_at,
                generated_at      = NOW()
            """,
            genticspace_id, experience_level, instructions, readme_fetched_at,
        )


async def _generate(agent: dict, experience_level: str, website_text: str | None) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    sources = [
        f"Agent name: {agent.get('name') or agent['genticspace_id']}\n"
        f"Website: {agent.get('web_endpoint') or 'unknown'}\n"
        f"User experience level: {experience_level}"
    ]
    readme_text = agent.get("readme_text")
    if readme_text:
        source_label = "Hugging Face" if agent.get("huggingface_url") else "GitHub"
        sources.append(f"{source_label} README:\n{readme_text[:_MAX_README_CHARS_FOR_PROMPT]}")
    if website_text:
        sources.append(f"Website content (scraped from {agent.get('web_endpoint')}):\n{website_text}")

    user_content = "\n\n".join(sources)

    response = await client.messages.create(
        model="claude-opus-4-8",
        max_tokens=4096,
        thinking={"type": "adaptive"},
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )

    if response.stop_reason == "refusal":
        logger.warning("Deployment guide generation refused for %s", agent["genticspace_id"])
        return "We couldn't generate deployment instructions for this agent right now. Check the agent's website or repository directly."

    text = next((b.text for b in response.content if b.type == "text"), "")
    text = text.replace("—", ", ")
    return text.strip() or "No instructions could be generated from the available source material."


async def get_or_generate_deployment_guide(
    genticspace_id: str, experience_level: str | None, force: bool = False
) -> dict:
    level = _normalize_level(experience_level)

    agent = await _get_agent(genticspace_id)
    if agent is None:
        raise LookupError(f"Agent {genticspace_id} not found")

    if not force:
        cached = await _get_cached_guide(genticspace_id, level)
        if cached and cached["readme_fetched_at"] == agent["readme_fetched_at"]:
            return {
                "instructions": cached["instructions"],
                "generated_at": cached["generated_at"],
                "cached": True,
                "has_readme": True,
            }

    # Github/Hugging Face README (already indexed) plus a live fetch of the
    # agent's own website, when it has one — different sources tend to cover
    # different things (install commands vs. pricing/signup), so guides pull
    # from whatever real material actually exists for this agent instead of
    # requiring a README specifically.
    website_text = await _fetch_website_text(agent.get("web_endpoint"))

    if not agent.get("readme_text") and not website_text:
        return {
            "instructions": (
                "No README or website content could be found for this agent yet. Check back "
                "after the next scrape, or visit the agent's page directly."
            ),
            "generated_at": None,
            "cached": False,
            "has_readme": False,
        }

    instructions = await _generate(agent, level, website_text)
    await _save_guide(genticspace_id, level, instructions, agent["readme_fetched_at"])

    return {
        "instructions": instructions,
        "generated_at": datetime.now(timezone.utc),
        "cached": False,
        "has_readme": True,
    }


_CHAT_SYSTEM_PROMPT = """You are a quick help assistant embedded on an AI agent's deployment guide page on Genticspace, an AI agent marketplace. You're given the same real source material the guide was generated from (a GitHub/Hugging Face README and/or scraped website text) plus the deployment guide already shown to the user. Answer their follow-up question using ONLY that material — never invent commands, error causes, pricing, or capabilities that aren't actually stated. If the material doesn't answer the question, say so plainly and suggest checking the agent's own site or repo directly, rather than guessing.

Keep answers short (2-5 sentences, or a short code block if a command is being asked for). No preamble like "Based on the README". Never use em dashes (—); use a comma, period, or colon instead."""

_MAX_CHAT_HISTORY_TURNS = 6


async def answer_deployment_question(
    genticspace_id: str,
    question: str,
    experience_level: str | None,
    history: list[dict] | None = None,
) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not configured")

    agent = await _get_agent(genticspace_id)
    if agent is None:
        raise LookupError(f"Agent {genticspace_id} not found")

    level = _normalize_level(experience_level)
    website_text = await _fetch_website_text(agent.get("web_endpoint"))
    cached_guide = await _get_cached_guide(genticspace_id, level)

    context_parts = [
        f"Agent name: {agent.get('name') or agent['genticspace_id']}",
        f"Website: {agent.get('web_endpoint') or 'unknown'}",
    ]
    readme_text = agent.get("readme_text")
    if readme_text:
        source_label = "Hugging Face" if agent.get("huggingface_url") else "GitHub"
        context_parts.append(f"{source_label} README:\n{readme_text[:_MAX_README_CHARS_FOR_PROMPT]}")
    if website_text:
        context_parts.append(f"Website content (scraped from {agent.get('web_endpoint')}):\n{website_text}")
    if cached_guide:
        context_parts.append(f"Deployment guide already shown to the user:\n{cached_guide['instructions']}")

    if len(context_parts) <= 2:
        return (
            "I don't have any real source material indexed for this agent yet (no README or "
            "website content), so I can't answer that reliably. Check the agent's own page directly."
        )

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    messages = []
    for turn in (history or [])[-_MAX_CHAT_HISTORY_TURNS:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            messages.append({"role": role, "content": str(content)[:2000]})
    messages.append({"role": "user", "content": question[:1000]})

    system = f"{_CHAT_SYSTEM_PROMPT}\n\n---\n\n" + "\n\n".join(context_parts)

    response = await client.messages.create(
        model="claude-opus-4-8",
        max_tokens=600,
        system=system,
        messages=messages,
    )

    if response.stop_reason == "refusal":
        return "I can't help with that one. Try rephrasing, or check the agent's site/repo directly."

    text = next((b.text for b in response.content if b.type == "text"), "")
    text = text.replace("—", ", ")
    return text.strip() or "I couldn't come up with an answer to that from what's indexed for this agent."
