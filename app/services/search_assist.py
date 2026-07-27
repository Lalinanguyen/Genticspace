import json
import logging

import anthropic

from app.config import settings

logger = logging.getLogger(__name__)

_MAX_CANDIDATES_FOR_RERANK = 30

_RERANK_SYSTEM_PROMPT = """You are a search-relevance assistant for Tracent, an AI agent marketplace. You are given a user's search request and a list of candidate agents already narrowed down by keyword search from Tracent's own catalog. For each candidate, decide whether it's a genuine match for what the user asked for, and if so, give one short reason why, grounded only in the candidate's own name/description/tags, never invented. Only mark an agent relevant if it plausibly satisfies the request; when in doubt, mark it not relevant rather than padding the list."""

_RERANK_SCHEMA = {
    "type": "object",
    "properties": {
        "matches": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "tracent_id": {"type": "string"},
                    "relevant": {"type": "boolean"},
                    "reason": {"type": "string"},
                },
                "required": ["tracent_id", "relevant", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["matches"],
    "additionalProperties": False,
}


async def semantic_rerank(task_text: str, candidates: list[dict]) -> dict[str, str]:
    """Ask Claude which of the SQL-narrowed candidates genuinely match a
    specific search request, and why. Returns {tracent_id: reason} for the
    agents Claude judged relevant; empty dict on any failure or missing
    config, so callers can just keep the plain SQL scoring in that case."""
    if not settings.ANTHROPIC_API_KEY or not candidates:
        return {}

    pool = candidates[:_MAX_CANDIDATES_FOR_RERANK]
    listing = "\n".join(
        f"- tracent_id={c['tracent_id']}: {c.get('name') or '(unnamed)'} - "
        f"{(c.get('description') or '')[:200]} "
        f"[tags: {', '.join(c.get('industry_tags') or [])}]"
        for c in pool
    )
    user_content = f"User's search request: {task_text}\n\nCandidates:\n{listing}"

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model="claude-opus-4-8",
            max_tokens=2000,
            thinking={"type": "adaptive"},
            system=_RERANK_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            output_config={"format": {"type": "json_schema", "schema": _RERANK_SCHEMA}},
        )
        if response.stop_reason == "refusal":
            return {}
        text = next((b.text for b in response.content if b.type == "text"), "")
        data = json.loads(text)
        return {
            m["tracent_id"]: m["reason"]
            for m in data.get("matches", [])
            if m.get("relevant") and m.get("tracent_id")
        }
    except Exception as exc:
        logger.warning("Semantic rerank failed for query %r: %s", task_text, exc)
        return {}


_RESOLVE_SYSTEM_PROMPT = """You help refine a marketplace search when keyword matching found nothing. You're given a user's search request that produced zero results in Tracent's AI agent catalog. Use web search if it helps you understand what the user is actually asking about (e.g. a specific product, protocol, or category you don't recognize), then respond with ONLY a comma-separated list of 3-8 alternative keywords or synonyms that might appear in a matching agent's name, description, or tags. No other text, no explanation."""


async def resolve_ambiguous_query(task_text: str) -> list[str]:
    """Last-resort fallback for a search that matched nothing in SQL: ask
    Claude, with live web search, for better search terms, so the caller can
    retry the SQL pass once. Returns [] on any failure or missing config.
    This is the only path that incurs the web_search per-search fee, so
    callers should gate it tightly (zero-result queries only)."""
    if not settings.ANTHROPIC_API_KEY:
        return []

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model="claude-opus-4-8",
            max_tokens=300,
            system=_RESOLVE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": task_text}],
            tools=[{"type": "web_search_20260209", "name": "web_search"}],
        )
        if response.stop_reason == "refusal":
            return []
        text = next((b.text for b in response.content if b.type == "text"), "")
        terms = [t.strip().lower() for t in text.split(",") if t.strip()]
        return terms[:8]
    except Exception as exc:
        logger.warning("Query resolution failed for %r: %s", task_text, exc)
        return []
