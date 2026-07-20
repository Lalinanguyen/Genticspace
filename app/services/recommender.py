import re
from typing import Optional

from app.services.agent_queries import query_agents

_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "your",
    "you", "are", "can", "will", "need", "want", "like", "using", "use",
    "a", "an", "to", "of", "in", "on", "it", "my", "our", "me",
}

_PROTOCOL_LIB_TO_FIELD = {
    "mcp": "mcp_endpoint",
    "a2a": "a2a_endpoint",
    "x402": "x402_support",
}

_CANDIDATE_POOL_SIZE = 200


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
        haystack = " ".join(
            filter(None, [agent.get("name"), agent.get("description")])
        ).lower()
        skill_text = " ".join(
            " ".join(filter(None, [s.get("skill_name"), s.get("description"), s.get("tags")]))
            for s in skills
        ).lower()
        combined_tokens = _tokenize(haystack + " " + skill_text)
        overlap = task_tokens & combined_tokens
        if overlap:
            score += 2 * len(overlap)
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


async def get_recommendations(
    conn,
    user: dict,
    task_text: str,
    filters: dict,
    limit: int = 10,
) -> list[dict]:
    candidates = await query_agents(conn, page=1, page_size=_CANDIDATE_POOL_SIZE, **filters)
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

    task_tokens = _tokenize(task_text or "")

    scored = []
    for agent in agents:
        profile = provider_profiles.get((agent.get("source"), agent.get("provider_org")))
        score, reasons = score_agent(
            agent, skills_by_tracent.get(agent["tracent_id"], []), user, github_cache, task_tokens, profile
        )
        scored.append({**agent, "score": score, "reasons": reasons})

    scored.sort(key=lambda a: a["score"], reverse=True)
    return scored[:limit]
