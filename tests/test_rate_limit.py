"""
Tests for app/rate_limit.py's slowapi Limiter as applied to the new
anonymous submission path:

  - POST /agents/submit (app/routes/agents.py's `submit_router`) is
    decorated with @limiter.limit("5/minute") and returns 429 on the 6th
    request/minute/IP.
  - Public reads (GET /agents with a key, GET /public/agents with none)
    fall back to the 60/minute default (app/rate_limit.py's
    `Limiter(..., default_limits=["60/minute"])`), comfortably tolerating a
    handful of rapid requests that would already have tripped the stricter
    write limit above.

The `_clean_state` autouse fixture in conftest.py resets slowapi's
in-memory hit counters before every test, so these tests don't depend on
(or pollute) execution order. httpx's ASGITransport has no real client IP,
so every request in a test lands in the same rate-limit bucket by design —
that's exactly what lets a single test drive a route past its limit.
"""
SUBMIT_BODY = {
    "name": "Rate Limit Test Agent",
    "endpoint_url": "https://example.com/a2a",
    "submitter_email": "ratelimit@example.com",
}


async def test_submit_agent_rejects_after_five_per_minute(client):
    for i in range(5):
        resp = await client.post("/agents/submit", json=SUBMIT_BODY)
        assert resp.status_code == 201, f"request {i + 1} unexpectedly failed: {resp.text}"

    sixth = await client.post("/agents/submit", json=SUBMIT_BODY)
    assert sixth.status_code == 429


async def test_legacy_agents_reads_tolerate_more_than_five_requests_per_minute(client, master_key_headers):
    # Well above the 5/min write limit but comfortably under the 60/min read
    # default — proves reads use the higher default limit, not the writes'
    # stricter one.
    for i in range(20):
        resp = await client.get("/agents", headers=master_key_headers)
        assert resp.status_code == 200, f"read {i + 1} unexpectedly rate-limited: {resp.text}"


async def test_public_agents_reads_tolerate_more_than_five_requests_per_minute(client):
    for i in range(20):
        resp = await client.get("/public/agents")
        assert resp.status_code == 200, f"read {i + 1} unexpectedly rate-limited: {resp.text}"


async def test_public_agents_search_reads_also_tolerate_more_than_five_requests_per_minute(client):
    for i in range(20):
        resp = await client.get("/public/agents", params={"q": "anything"})
        assert resp.status_code == 200, f"search {i + 1} unexpectedly rate-limited: {resp.text}"
