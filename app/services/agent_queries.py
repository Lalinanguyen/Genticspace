from typing import Optional

from app.services.trust_summary import compute_trust_summary

# EXISTS-subquery fragment appended to any "SELECT a.* FROM agents a ..."
# query so callers can compute trust_summary per row without a second round
# trip. Aliases the source table as `a`, matching every base query below.
_HIGH_FLAG_EXISTS = """(
        EXISTS (
            SELECT 1 FROM reputation_flags hf
            WHERE hf.tracent_id = a.tracent_id AND hf.severity = 'high'
        )
    ) AS has_high_flag"""


def _row_to_dict(row) -> dict:
    d = dict(row)
    d.pop("_no_desc", None)
    # submitter_email/moderation_note are for the authenticated admin
    # moderation endpoint only (GET /admin/submissions) — never public.
    d.pop("submitter_email", None)
    d.pop("moderation_note", None)
    has_high_flag = d.pop("has_high_flag", False)
    d["trust_summary"] = compute_trust_summary(
        trust_tier=d.get("trust_tier"),
        verified=bool(d.get("verified", False)),
        has_high_severity_flag=bool(has_high_flag),
    )
    return d


async def query_agents(
    conn,
    *,
    q: Optional[str] = None,
    source: Optional[str] = None,
    verified: Optional[bool] = None,
    trust_tier: Optional[str] = None,
    a2a_only: bool = False,
    mcp_only: bool = False,
    x402_only: bool = False,
    flagged_only: bool = False,
    safe_only: bool = False,
    industry: Optional[str] = None,
    license: Optional[str] = None,
    deployment: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
) -> dict:
    conditions = []
    params: list = []
    needs_skills_join = False

    def add(cond: str, val=None):
        params.append(val)
        conditions.append(cond.replace("?", f"${len(params)}"))

    if q:
        needs_skills_join = True
        params.append(f"%{q}%")
        like = f"${len(params)}"
        conditions.append(
            f"(a.name ILIKE {like} OR a.description ILIKE {like} "
            f"OR s.skill_name ILIKE {like} OR s.tags ILIKE {like})"
        )
    if source:
        add("a.source = ?", source)
    if verified is not None:
        add("a.verified = ?", verified)
    if trust_tier:
        add("a.trust_tier = ?", trust_tier)
    if a2a_only:
        conditions.append("a.a2a_endpoint IS NOT NULL")
    if mcp_only:
        conditions.append("a.mcp_endpoint IS NOT NULL")
    if x402_only:
        conditions.append("a.x402_support = TRUE")
    if safe_only:
        conditions.append("a.safe_to_transact = TRUE")
    if industry:
        parts = [p.strip() for p in industry.split(",") if p.strip()]
        if parts:
            params.append(parts)
            conditions.append(f"a.industry_tags && ${len(params)}")
    if license:
        parts = [p.strip() for p in license.split(",") if p.strip()]
        if parts:
            params.append(parts)
            conditions.append(f"a.license = ANY(${len(params)})")
    if deployment:
        parts = [p.strip() for p in deployment.split(",") if p.strip()]
        if parts:
            params.append(parts)
            conditions.append(f"a.deployment_types && ${len(params)}")

    # Self-submitted listings marked private never appear in general browsing —
    # the owner views them via GET /public/my-agents instead.
    conditions.append("a.is_private IS NOT TRUE")
    # Pending/rejected anonymous submissions (POST /agents/submit,
    # source='self-submitted') stay invisible until admin-approved. Existing
    # rows across every other source default to 'approved' at the schema
    # level, so this is a no-op for them.
    conditions.append("a.moderation_status = 'approved'")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    skills_join = "LEFT JOIN agent_skills s ON s.tracent_id = a.tracent_id" if needs_skills_join else ""

    # Named so it can appear in the ORDER BY below: Postgres requires
    # SELECT DISTINCT's ORDER BY expressions to appear literally in the
    # select list, not just their underlying columns — a bare
    # "(description IS NULL ...)" expression doesn't qualify even though
    # `description` itself is selected via `a.*`. This affects both DISTINCT
    # branches below (flagged_only pre-dates this port; needs_skills_join is
    # new here) — confirmed by reproducing deslop's original flagged_only
    # query in isolation, which throws the same InvalidColumnReferenceError
    # independent of anything else in this change.
    no_desc = "(a.description IS NULL OR trim(a.description) = '') AS _no_desc"

    if flagged_only:
        base = f"""
            SELECT DISTINCT a.*, {_HIGH_FLAG_EXISTS}, {no_desc} FROM agents a
            {skills_join}
            JOIN reputation_flags f ON f.tracent_id = a.tracent_id
            {where}
        """
    elif needs_skills_join:
        base = f"""
            SELECT DISTINCT a.*, {_HIGH_FLAG_EXISTS}, {no_desc} FROM agents a
            {skills_join}
            {where}
        """
    else:
        base = f"SELECT a.*, {_HIGH_FLAG_EXISTS}, {no_desc} FROM agents a {where}"

    total = await conn.fetchval(f"SELECT COUNT(*) FROM ({base}) sub", *params)
    offset = (page - 1) * page_size
    # Description-less agents sort to the back of browsing rather than being
    # hidden outright: early pages always show fully-described listings, and
    # agents rejoin the front as the backfill fills their descriptions in.
    rows = await conn.fetch(
        f"""{base}
        ORDER BY _no_desc ASC, a.first_seen DESC
        LIMIT ${len(params)+1} OFFSET ${len(params)+2}""",
        *params, page_size, offset,
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "agents": [_row_to_dict(r) for r in rows],
    }


async def list_skill_categories(conn) -> list[dict]:
    """
    Skill-tag-derived categories, distinct from (and a finer-grained
    complement to) the curated `industry_tags` checkbox facet already used
    by the marketplace filters. Only counts publicly-visible agents (not
    private, not pending/rejected anonymous submissions), matching
    query_agents' visibility rules. agent_skills.tags is a JSON array
    string, so this casts to jsonb and unnests it per agent.
    """
    rows = await conn.fetch(
        """
        SELECT tag AS category, COUNT(DISTINCT tracent_id) AS agent_count
        FROM (
            SELECT s.tracent_id,
                   jsonb_array_elements_text(
                       CASE
                           WHEN s.tags IS NOT NULL AND s.tags <> '' THEN s.tags::jsonb
                           ELSE '[]'::jsonb
                       END
                   ) AS tag
            FROM agent_skills s
            JOIN agents a ON a.tracent_id = s.tracent_id
            WHERE a.is_private IS NOT TRUE AND a.moderation_status = 'approved'
        ) expanded
        GROUP BY tag
        ORDER BY agent_count DESC, tag ASC
        """
    )
    return [dict(r) for r in rows]
