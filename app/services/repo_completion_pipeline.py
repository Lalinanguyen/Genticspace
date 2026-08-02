"""
Phase 2 of the Repo Completion pipeline: turns a thin/incomplete already-
scraped listing into a completed one by splicing in permissively-licensed
code from other already-scraped listings, via the Managed Agents platform
(app/services/managed_agents.py::start_completion_run) doing the actual
merge. See app/services/license_classifier.py for classification and
app/services/repo_consent.py for the real, slower consent path used for
non-permissive candidates -- not exercised by this pilot.

Sourced entirely from this app's own already-scraped `agents` table, not a
live GitHub Search API integration. Candidate matching is a cheap
tag/keyword prefilter (mirroring app/services/recommender.py's haystack)
followed by one Claude judgment call per target (mirroring
app/services/search_assist.py::semantic_rerank), rather than a new
embeddings/vector pipeline -- nothing in this codebase has one today.
"""
import json
import logging
import re

import anthropic

from app.config import settings
from app.db.database import get_conn
from app.services.license_classifier import classify_license

logger = logging.getLogger(__name__)

# Same "sparse listing" signal app/services/agent_queries.py::query_agents
# already sorts on (description-less listings last), extended with
# readme/license thinness -- no new GitHub API calls, just what's already
# in the table from scraping.
_MIN_README_CHARS = 500
_CANDIDATE_POOL_SIZE = 15
_MAX_PICKED_CANDIDATES = 3

_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "your",
    "you", "are", "can", "will", "need", "want", "like", "using", "use",
    "a", "an", "to", "of", "in", "on", "it", "my", "our", "me",
    "ai", "agent", "agents", "tool", "tools", "app", "apps", "assistant",
    "assistants", "help", "helps", "based", "system", "platform",
}

# Deliberately excludes readme_text -- ILIKE over a large free-text column
# for every token, with no full-text index on it, is the kind of query
# app/services/recommender.py avoids on its hot request path for the same
# reason; this batch script isn't hot-path, but there's no need to pay for
# what the existing precedent already decided against.
_SEARCHABLE_COLUMNS = [
    "name", "description", "license",
    "industry_tags::text", "sdk_compat::text", "interaction_types::text",
]

_JUDGE_SYSTEM_PROMPT = """You are helping complete an unfinished open-source AI agent project by identifying genuinely compatible code from other real, already-cataloged repositories to merge in. You're given the incomplete target project's README and a list of candidate repositories, already narrowed by keyword overlap. For each candidate, decide whether it is genuinely compatible and worth merging from: same or interoperable language/stack, complementary (not merely duplicate) functionality, a real fit for completing the target, not just a superficially similar README. Ground every judgment only in the text given, never invent capabilities. Only mark a candidate compatible if you're confident it would actually help complete this project; when in doubt, mark it not compatible."""

_JUDGE_SCHEMA = {
    "type": "object",
    "properties": {
        "picks": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "tracent_id": {"type": "string"},
                    "compatible": {"type": "boolean"},
                    "reason": {"type": "string"},
                },
                "required": ["tracent_id", "compatible", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["picks"],
    "additionalProperties": False,
}


def _tokenize(text: str) -> set[str]:
    tokens = re.split(r"[^a-z0-9]+", text.lower())
    return {t for t in tokens if len(t) >= 3 and t not in _STOPWORDS}


async def select_completion_targets(limit: int = 10) -> list[dict]:
    """Thin/incomplete already-scraped GitHub listings with no completion
    attempt yet, ranked by thinness. Uses only signals already populated by
    scraping (readme_text length, description, license) -- no fresh GitHub
    API calls to check commit/release counts the way the original spec's
    heuristics would; a richer signal set is a future refinement once this
    scales past a pilot."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT a.* FROM agents a
            WHERE a.source = 'github' AND a.source_id IS NOT NULL
              AND a.is_private IS NOT TRUE
              AND NOT EXISTS (
                  SELECT 1 FROM repo_completion_requests r WHERE r.tracent_id = a.tracent_id
              )
              AND (
                  a.readme_text IS NULL OR length(a.readme_text) < $1
                  OR a.description IS NULL OR trim(a.description) = ''
                  OR a.license IS NULL
              )
            ORDER BY
                (a.readme_text IS NULL OR length(a.readme_text) < $1) DESC,
                (a.description IS NULL OR trim(a.description) = '') DESC,
                a.first_seen DESC
            LIMIT $2
            """,
            _MIN_README_CHARS, limit,
        )
    return [dict(r) for r in rows]


async def find_candidates(target: dict, pool_size: int = _CANDIDATE_POOL_SIZE) -> list[dict]:
    """Cheap tag/keyword prefilter over the already-scraped catalog --
    mirrors app/services/recommender.py::score_agent's haystack, but
    agent-to-agent instead of task-text-to-agent (nothing in this codebase
    compares two agents to each other already)."""
    haystack_parts = [
        target.get("description"), target.get("readme_text"),
        *(target.get("industry_tags") or []),
        *(target.get("sdk_compat") or []),
        *(target.get("interaction_types") or []),
    ]
    tokens = _tokenize(" ".join(filter(None, haystack_parts)))
    if not tokens:
        return []

    conditions = []
    params: list = [target["tracent_id"]]
    for token in tokens:
        params.append(f"%{token}%")
        idx = len(params)
        conditions.extend(f"{col} ILIKE ${idx}" for col in _SEARCHABLE_COLUMNS)

    sql = f"""
        SELECT * FROM agents
        WHERE tracent_id != $1 AND source = 'github' AND source_id IS NOT NULL
          AND is_private IS NOT TRUE
          AND ({" OR ".join(conditions)})
        ORDER BY first_seen DESC
        LIMIT ${len(params) + 1}
    """
    async with get_conn() as conn:
        rows = await conn.fetch(sql, *params, pool_size)
    return [dict(r) for r in rows]


async def judge_compatibility(target: dict, candidates: list[dict]) -> list[dict]:
    """Ask Claude which of the keyword-narrowed candidates are genuinely
    compatible enough to splice code from -- token overlap alone can't tell
    a truly related repo from a coincidentally similar README. Returns the
    subset of `candidates` Claude picked (at most _MAX_PICKED_CANDIDATES),
    each with a "compatibility_reason" key added. Empty list on any failure
    or missing config, same graceful-degrade convention as
    app/services/search_assist.py::semantic_rerank -- callers should treat
    that as "no compatible candidates found" rather than an error."""
    if not settings.ANTHROPIC_API_KEY or not candidates:
        return []

    target_readme = (target.get("readme_text") or target.get("description") or "")[:3000]
    listing = "\n\n".join(
        f"- tracent_id={c['tracent_id']}: {c.get('name') or c['tracent_id']}\n"
        f"  {(c.get('readme_text') or c.get('description') or '')[:800]}"
        for c in candidates
    )
    user_content = (
        f"Target project (incomplete, needs completion):\n{target_readme}\n\n"
        f"Candidate repositories:\n{listing}"
    )

    try:
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = await client.messages.create(
            model="claude-opus-4-8",
            max_tokens=2000,
            thinking={"type": "adaptive"},
            system=_JUDGE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_content}],
            output_config={"format": {"type": "json_schema", "schema": _JUDGE_SCHEMA}},
        )
        if response.stop_reason == "refusal":
            return []
        text = next((b.text for b in response.content if b.type == "text"), "")
        data = json.loads(text)
    except Exception as exc:
        logger.warning("Compatibility judgment failed for %s: %s", target.get("tracent_id"), exc)
        return []

    picked_reasons = {
        p["tracent_id"]: p["reason"]
        for p in data.get("picks", [])
        if p.get("compatible") and p.get("tracent_id")
    }
    by_id = {c["tracent_id"]: c for c in candidates}
    picked = [
        {**by_id[tid], "compatibility_reason": reason}
        for tid, reason in picked_reasons.items()
        if tid in by_id
    ]
    return picked[:_MAX_PICKED_CANDIDATES]


def owner_repo_from_github_url(repo_url: str) -> str:
    return repo_url.rstrip("/").removeprefix("https://github.com/").removeprefix("http://github.com/")


async def license_gate(picks: list[dict]) -> list[dict]:
    """Classifies each of Claude's picked candidates and keeps only
    permissive ones -- the hard rule from the plan, no exceptions this
    pilot (copyleft/unlicensed/unknown still route to the real
    app/services/repo_consent.py flow, just not fast enough to be part of
    this pilot). Mutates each pick in place with its classification, so the
    caller can persist a full picture of what was considered, not just
    what passed the gate."""
    gated = []
    for pick in picks:
        owner_repo = owner_repo_from_github_url(pick.get("github_url") or f"https://github.com/{pick['source_id']}")
        result = await classify_license(owner_repo)
        pick["license_spdx_id"] = result.spdx_id
        pick["license_classification"] = result.classification
        if result.classification == "permissive":
            gated.append(pick)
    return gated
