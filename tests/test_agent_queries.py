import re

import pytest

from app.services.agent_queries import query_agents


class RecordingConn:
    """Fakes just enough of asyncpg's Connection to inspect the SQL/params
    query_agents() builds, without needing a real database."""

    def __init__(self, total=0, rows=None):
        self.total = total
        self.rows = rows if rows is not None else []
        self.calls = []

    async def fetchval(self, query, *params):
        self.calls.append(("fetchval", query, params))
        return self.total

    async def fetch(self, query, *params):
        self.calls.append(("fetch", query, params))
        return self.rows

    def fetch_call(self):
        return next(c for c in self.calls if c[0] == "fetch")


def _placeholders(sql: str) -> set[int]:
    return {int(n) for n in re.findall(r"\$(\d+)", sql)}


async def test_default_query_always_excludes_private_listings():
    conn = RecordingConn()
    await query_agents(conn)
    sql, params = conn.fetch_call()[1], conn.fetch_call()[2]
    assert "is_private IS NOT TRUE" in sql
    assert "WHERE" in sql
    # only the trailing LIMIT/OFFSET params for an otherwise-unfiltered query
    assert list(params) == [20, 0]


async def test_search_term_is_bound_as_a_parameter_not_interpolated():
    conn = RecordingConn()
    malicious = "'; DROP TABLE agents; --"
    await query_agents(conn, q=malicious)
    sql, params = conn.fetch_call()[1], conn.fetch_call()[2]
    assert malicious not in sql
    assert any(malicious in str(p) for p in params)


@pytest.mark.parametrize("field,value", [
    ("source", "'; DROP TABLE agents; --"),
    ("trust_tier", "x' OR '1'='1"),
    ("license", "a,'; DROP TABLE agents; --"),
    ("industry", "a,'); DELETE FROM agents; --"),
    ("deployment", "'); DROP TABLE agents; --"),
])
async def test_every_string_filter_is_parameterized(field, value):
    conn = RecordingConn()
    await query_agents(conn, **{field: value})
    sql = conn.fetch_call()[1]
    assert "DROP TABLE" not in sql
    assert "DELETE FROM" not in sql
    assert "'; " not in sql


async def test_placeholder_numbers_exactly_match_bound_params():
    conn = RecordingConn()
    await query_agents(
        conn, q="agent", source="github", verified=True,
        trust_tier="onchain", industry="Healthcare,Legal",
    )
    sql, params = conn.fetch_call()[1], conn.fetch_call()[2]
    assert _placeholders(sql) == set(range(1, len(params) + 1))


async def test_boolean_only_filters_add_conditions_without_adding_params():
    conn = RecordingConn()
    await query_agents(conn, a2a_only=True, mcp_only=True, x402_only=True, safe_only=True)
    sql, params = conn.fetch_call()[1], conn.fetch_call()[2]
    assert "a2a_endpoint IS NOT NULL" in sql
    assert "mcp_endpoint IS NOT NULL" in sql
    assert "x402_support = TRUE" in sql
    assert "safe_to_transact = TRUE" in sql
    # no params bound for these except the trailing LIMIT/OFFSET pair
    assert list(params) == [20, 0]


async def test_flagged_only_joins_reputation_flags():
    conn = RecordingConn()
    await query_agents(conn, flagged_only=True)
    sql = conn.fetch_call()[1]
    assert "JOIN reputation_flags" in sql
    assert "SELECT DISTINCT a.*" in sql


async def test_industry_filter_splits_trims_and_drops_blanks():
    conn = RecordingConn()
    await query_agents(conn, industry=" Healthcare , Legal ,  ")
    sql, params = conn.fetch_call()[1], conn.fetch_call()[2]
    assert "industry_tags &&" in sql
    assert ["Healthcare", "Legal"] in params


async def test_blank_industry_filter_adds_no_condition():
    conn = RecordingConn()
    await query_agents(conn, industry="   ,  ,")
    sql = conn.fetch_call()[1]
    assert "industry_tags" not in sql


async def test_license_filter_uses_any_array_match():
    conn = RecordingConn()
    await query_agents(conn, license="Open Source,Commercial")
    sql, params = conn.fetch_call()[1], conn.fetch_call()[2]
    assert "license = ANY(" in sql
    assert ["Open Source", "Commercial"] in params


async def test_pagination_computes_limit_and_offset():
    conn = RecordingConn()
    await query_agents(conn, page=3, page_size=10)
    params = conn.fetch_call()[2]
    assert list(params[-2:]) == [10, 20]  # page_size, offset = (page - 1) * page_size


async def test_result_shape_passes_through_total_and_rows():
    # _row_to_dict (see app/services/agent_queries.py) enriches every row with
    # trust_summary and sandboxable/sandbox_url -- real, always-on
    # computations, not something this shape test should strip out.
    conn = RecordingConn(total=42, rows=[{"tracent_id": "abc"}])
    result = await query_agents(conn, page=2, page_size=5)
    assert result == {
        "total": 42,
        "page": 2,
        "page_size": 5,
        "agents": [{"tracent_id": "abc", "trust_summary": "unverified", "sandboxable": False, "sandbox_url": None}],
    }


async def test_count_query_uses_same_params_as_fetch_query():
    conn = RecordingConn()
    await query_agents(conn, q="agent", verified=True)
    count_call = next(c for c in conn.calls if c[0] == "fetchval")
    fetch_call = conn.fetch_call()
    # fetch has two extra trailing params (page_size, offset) the count query doesn't need
    assert list(fetch_call[2][:-2]) == list(count_call[2])
