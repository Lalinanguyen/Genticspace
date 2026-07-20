import re
from typing import Optional

from app.services.agent_queries import query_agents

_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "your",
    "you", "are", "can", "will", "need", "want", "like", "using", "use",
    "a", "an", "to", "of", "in", "on", "it", "my", "our", "me",
    # Near-universal in this marketplace's own vocabulary (almost every
    # listing's name/description says "AI agent/tool/assistant"), so they
    # add no discriminating signal and would dilute genuinely on-topic
    # matches (e.g. "legal") with noise matches on every other listing.
    "ai", "agent", "agents", "tool", "tools", "app", "apps", "assistant",
    "assistants", "help", "helps", "based", "system", "platform",
}

_PROTOCOL_LIB_TO_FIELD = {
    "mcp": "mcp_endpoint",
    "a2a": "a2a_endpoint",
    "x402": "x402_support",
}

# query_agents (and the no-task path below) order by first_seen DESC, so a
# small pool only ever searches the newest listings. When a task query is
# present, _fetch_task_candidates narrows in SQL first (ILIKE across the
# searchable columns) rather than transferring the whole wide table, so this
# pool size just bounds the worst case rather than being the typical fetch.
_CANDIDATE_POOL_SIZE_WITH_TASK = 20000
_CANDIDATE_POOL_SIZE_NO_TASK = 200


def _tokenize(text: str) -> set[str]:
    tokens = re.split(r"[^a-z0-9]+", text.lower())
    return {t for t in tokens if len(t) >= 3 and t not in _STOPWORDS}


def score_agent(
    agent: dict,
    skills: list[dict],
    user: dict,
    github_cache: Optional[dict],
    task_tokens: set[str],
    provider_profile: Optional[dict] = None,
) -> tuple[float, list[str]]:
    score = 0.0
    reasons: list[str] = []

    detected_libs = set((github_cache or {}).get("detected_libs") or [])
    for lib, field in _PROTOCOL_LIB_TO_FIELD.items():
        if lib not in detected_libs:
            continue
        has_support = agent.get(field)
        if has_support:
            score += 3
            reasons.append(f"Supports {lib.upper()}, matches your repos")

    experience = (user.get("experience_level") or "").lower()

    if provider_profile:
        provider_libs = set(provider_profile.get("detected_libs") or [])
        if detected_libs and provider_libs and (detected_libs & provider_libs):
            score += 2
            reasons.append("Built by a creator whose other work matches your stack too")

        followers = provider_profile.get("followers") or 0
        if followers >= 1000:
            if experience == "beginner":
                bonus = min(followers // 2000, 3)
            elif experience == "intermediate":
                bonus = min(followers // 5000, 2)
            else:
                bonus = min(followers // 10000, 1)
            if bonus:
                score += bonus
                reasons.append(f"From a well-established creator ({followers:,} followers)")

    if task_tokens:
        haystack_parts = [
            agent.get("name"), agent.get("description"), agent.get("license"),
            agent.get("access_model"), agent.get("pricing_model"),
            *(agent.get("industry_tags") or []),
            *(agent.get("deployment_types") or []),
            *(agent.get("interaction_types") or []),
            *(agent.get("sdk_compat") or []),
        ]
        haystack = " ".join(filter(None, haystack_parts)).lower()
        skill_text = " ".join(
            " ".join(filter(None, [s.get("skill_name"), s.get("description"), s.get("tags")]))
            for s in skills
        ).lower()
        combined_tokens = _tokenize(haystack + " " + skill_text)
        overlap = task_tokens & combined_tokens
        if overlap:
            # Weighted well above the popularity/verification bonuses below —
            # for a task search, actually matching what was asked for should
            # dominate ranking over how well-known or vetted the agent is.
            score += 5 * len(overlap)
            reasons.append(f"Matches your task: {', '.join(sorted(overlap)[:3])}")

    if experience == "beginner":
        if agent.get("verified"):
            score += 4
            reasons.append("Tracent-verified, good fit for your experience level")
        if agent.get("trust_tier") == "onchain":
            score += 2
        if (agent.get("risk_score") or 0) >= 0.5:
            score -= 5
    elif experience == "intermediate":
        if agent.get("verified"):
            score += 2
            reasons.append("Tracent-verified")
    # advanced: no skill-level boost, ranked purely on protocol/task match

    if agent.get("safe_to_transact"):
        score += 1

    return score, reasons


async def _load_provider_profiles(conn, agents: list[dict]) -> dict[tuple[str, str], dict]:
    """Normalize huggingface_profiles/github_profiles rows into a single
    lookup keyed by (source, provider_org), so score_agent doesn't need to
    know which platform an agent came from."""
    hf_orgs = {a["provider_org"] for a in agents if a.get("source") == "huggingface" and a.get("provider_org")}
    gh_orgs = {a["provider_org"] for a in agents if a.get("source") == "github" and a.get("provider_org")}

    profiles: dict[tuple[str, str], dict] = {}

    if hf_orgs:
        rows = await conn.fetch(
            "SELECT username, detected_libs, num_followers FROM huggingface_profiles WHERE username = ANY($1::text[])",
            list(hf_orgs),
        )
        for row in rows:
            profiles[("huggingface", row["username"])] = {
                "detected_libs": row["detected_libs"] or [],
                "followers": row["num_followers"] or 0,
            }

    if gh_orgs:
        rows = await conn.fetch(
            "SELECT username, detected_libs, followers FROM github_profiles WHERE username = ANY($1::text[])",
            list(gh_orgs),
        )
        for row in rows:
            profiles[("github", row["username"])] = {
                "detected_libs": row["detected_libs"] or [],
                "followers": row["followers"] or 0,
            }

    return profiles


_TASK_SEARCHABLE_COLUMNS = [
    "name", "description", "license", "access_model", "pricing_model",
    "industry_tags::text", "deployment_types::text",
    "interaction_types::text", "sdk_compat::text",
]


async def _fetch_task_candidates(conn, task_tokens: set[str], pool_size: int) -> list[dict]:
    """Search-narrow the candidate pool in SQL before transferring full rows,
    rather than pulling the whole (large, wide) agents table into Python on
    every request. Matches if ANY task token appears in ANY searchable
    column, across the full non-private catalog (not just recent listings)."""
    if not task_tokens:
        rows = await conn.fetch(
            "SELECT * FROM agents WHERE is_private IS NOT TRUE ORDER BY first_seen DESC LIMIT $1",
            pool_size,
        )
        return [dict(r) for r in rows]

    conditions = []
    params: list = []
    for token in task_tokens:
        params.append(f"%{token}%")
        idx = len(params)
        conditions.extend(f"{col} ILIKE ${idx}" for col in _TASK_SEARCHABLE_COLUMNS)

    sql = f"""
        SELECT * FROM agents
        WHERE is_private IS NOT TRUE AND ({" OR ".join(conditions)})
        ORDER BY first_seen DESC
        LIMIT ${len(params) + 1}
    """
    rows = await conn.fetch(sql, *params, pool_size)
    if rows:
        return [dict(r) for r in rows]

    # No text/tag match anywhere — fall back to a small pool of recent
    # listings so the response is a best-effort ranking, not empty.
    fallback = await conn.fetch(
        "SELECT * FROM agents WHERE is_private IS NOT TRUE ORDER BY first_seen DESC LIMIT $1",
        _CANDIDATE_POOL_SIZE_NO_TASK,
    )
    return [dict(r) for r in fallback]


async def get_recommendations(
    conn,
    user: dict,
    task_text: str,
    filters: dict,
    limit: int = 10,
) -> list[dict]:
    task_tokens = _tokenize(task_text or "")
    pool_size = _CANDIDATE_POOL_SIZE_WITH_TASK if task_tokens else _CANDIDATE_POOL_SIZE_NO_TASK

    if task_tokens or not filters:
        agents = await _fetch_task_candidates(conn, task_tokens, pool_size)
    else:
        candidates = await query_agents(conn, page=1, page_size=pool_size, **filters)
        agents = candidates["agents"]
    if not agents:
        return []

    tracent_ids = [a["tracent_id"] for a in agents]
    skill_rows = await conn.fetch(
        "SELECT * FROM agent_skills WHERE tracent_id = ANY($1::text[])", tracent_ids
    )
    skills_by_tracent: dict[str, list[dict]] = {}
    for row in skill_rows:
        skills_by_tracent.setdefault(row["tracent_id"], []).append(dict(row))

    github_cache = await conn.fetchrow(
        "SELECT * FROM github_repo_cache WHERE user_id = $1", user["id"]
    )
    github_cache = dict(github_cache) if github_cache else None

    provider_profiles = await _load_provider_profiles(conn, agents)

    scored = []
    for agent in agents:
        profile = provider_profiles.get((agent.get("source"), agent.get("provider_org")))
        score, reasons = score_agent(
            agent, skills_by_tracent.get(agent["tracent_id"], []), user, github_cache, task_tokens, profile
        )
        scored.append({**agent, "score": score, "reasons": reasons})

    scored.sort(key=lambda a: a["score"], reverse=True)
    return scored[:limit]
