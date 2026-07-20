from typing import Optional


def _row_to_dict(row) -> dict:
    return dict(row)


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

    def add(cond: str, val=None):
        params.append(val)
        conditions.append(cond.replace("?", f"${len(params)}"))

    if q:
        params.append(f"%{q}%")
        conditions.append(f"(name ILIKE ${len(params)} OR description ILIKE ${len(params)})")
    if source:
        add("source = ?", source)
    if verified is not None:
        add("verified = ?", verified)
    if trust_tier:
        add("trust_tier = ?", trust_tier)
    if a2a_only:
        conditions.append("a2a_endpoint IS NOT NULL")
    if mcp_only:
        conditions.append("mcp_endpoint IS NOT NULL")
    if x402_only:
        conditions.append("x402_support = TRUE")
    if safe_only:
        conditions.append("safe_to_transact = TRUE")
    if industry:
        parts = [p.strip() for p in industry.split(",") if p.strip()]
        if parts:
            params.append(parts)
            conditions.append(f"industry_tags && ${len(params)}")
    if license:
        parts = [p.strip() for p in license.split(",") if p.strip()]
        if parts:
            params.append(parts)
            conditions.append(f"license = ANY(${len(params)})")
    if deployment:
        parts = [p.strip() for p in deployment.split(",") if p.strip()]
        if parts:
            params.append(parts)
            conditions.append(f"deployment_types && ${len(params)}")

    # Self-submitted listings marked private never appear in general browsing —
    # the owner views them via GET /public/my-agents instead.
    conditions.append("is_private IS NOT TRUE")

    where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

    if flagged_only:
        base = f"""
            SELECT DISTINCT a.* FROM agents a
            JOIN reputation_flags f ON f.tracent_id = a.tracent_id
            {where}
        """
    else:
        base = f"SELECT * FROM agents {where}"

    total = await conn.fetchval(f"SELECT COUNT(*) FROM ({base}) sub", *params)
    offset = (page - 1) * page_size
    # Description-less agents sort to the back of browsing rather than being
    # hidden outright: early pages always show fully-described listings, and
    # agents rejoin the front as the backfill fills their descriptions in.
    rows = await conn.fetch(
        f"""{base}
        ORDER BY (description IS NULL OR trim(description) = '') ASC, first_seen DESC
        LIMIT ${len(params)+1} OFFSET ${len(params)+2}""",
        *params, page_size, offset,
    )

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "agents": [_row_to_dict(r) for r in rows],
    }
