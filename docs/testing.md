# Running the test suite

`tests/` is a real-Postgres integration suite for the backend: auth
(`app/db/auth.py`), trust labeling (`app/services/trust_summary.py`), search
and skill categories (`app/services/agent_queries.py`), the new anonymous
submission/moderation flow (`app/routes/agents.py`'s `submit_router` +
`app/routes/admin.py`'s `/admin/submissions*`), and rate limiting
(`app/rate_limit.py`).

Nothing about the DB layer is mocked. `tests/conftest.py` spins up a
disposable `<db>_test` Postgres database, runs `app.db.database.init_db()`'s
real schema against it, and every test hits the real FastAPI app
(`app.main:app`) through `httpx`'s `ASGITransport` — no separate mock app.
The database is recreated fresh each test session and dropped at the end.

## Prerequisites

- A reachable local Postgres server (any version supporting `DROP DATABASE
  ... WITH (FORCE)`, i.e. 13+).
- Python deps: `pip install -r requirements.txt -r requirements-dev.txt`.

## Local setup

1. Copy `.env` (or create one) with at least:

   ```
   ALCHEMY_API_KEY=dummy-key-for-local-simulation
   DATABASE_URL=postgresql://postgres@127.0.0.1:5432/tracent_deslop
   API_KEY=<any string — this becomes settings.API_KEY>
   JWT_SECRET=<any string>
   ```

   `DATABASE_URL`'s path is only used to derive the *test* database name —
   `conftest.py` overrides it in-process to `<path>_test` (e.g.
   `tracent_deslop_test`) before anything imports `app.config`, so the real
   dev database named in `.env` is never touched by the test run.

   `ANTHROPIC_API_KEY`, `GITHUB_TOKEN`, and `HUGGINGFACE_TOKEN` do not need
   to be set — they're `Optional[str] = None` in `app/config.py`, and
   nothing the test suite exercises calls out to those services. This was
   verified empirically (not assumed) while building this suite: importing
   `app.main` succeeds with those three variables entirely unset.

2. Run:

   ```
   pytest -v
   ```

## How isolation works

- `tests/conftest.py`'s session-scoped `_test_database` fixture drops and
  recreates the `_test` database once per test *session*, then runs
  `init_db()`'s schema against it.
- The `client` fixture wires `httpx.AsyncClient` to `app.main:app` via
  `ASGITransport`, **bypassing** `app.main`'s `lifespan`. That's
  deliberate: `lifespan` starts ~15 real scrapers/backfills and an
  `APScheduler` that would otherwise try to hit GitHub/HuggingFace/Alchemy
  over the network on every test run. The test DB pool is already managed
  directly by `_test_database`.
- The function-scoped, autouse `_clean_state` fixture truncates every table
  and resets slowapi's in-memory rate-limit counters before each test, so
  tests never leak data or rate-limit hits into one another regardless of
  execution order.
- `tests/helpers.py` has direct-SQL seeding helpers (`insert_agent`,
  `insert_skill`, `insert_flag`) for setting up fixture data the routes
  under test don't themselves expose a way to create.
- For the existing authenticated Contribute flow (`POST /public/agents`),
  `conftest.py`'s `jwt_user` fixture inserts a real row into `users`
  directly (skipping the signup/OTP mailer round trip) and mints a real
  JWT via `app.db.jwt_auth.create_access_token` — the same function
  `POST /auth/signup` and `POST /auth/login` call. The resulting token is
  verified by the real `get_current_user` dependency exactly as it would be
  for a token issued through the HTTP signup flow; nothing about JWT
  verification is mocked.

## What's covered

- `test_auth.py` — master API key, minted/revoked per-client keys, that
  `/admin/*` and the legacy `/agents` + `/trust` routers require a key, and
  that `/public/agents*` requires none.
- `test_trust_summary.py` — `compute_trust_summary`'s full label set and
  precedence order, as a pure unit test (no DB).
- `test_search_categories.py` — `q` search and skill-tag category counts,
  exercised through *both* `GET /agents` (legacy, key-gated) and
  `GET /public/agents` (public), since both share
  `app/services/agent_queries.py`'s `query_agents()`/`list_skill_categories()`.
- `test_moderation.py` — the anonymous `POST /agents/submit` ->
  pending -> admin approve/reject state machine, `submitter_email`/
  `moderation_note` never leaking into any public response, and (just as
  importantly) that the pre-existing authenticated Contribute flow
  (`POST /public/agents` with a JWT) is completely unaffected — still
  instant-live, no moderation gate.
- `test_rate_limit.py` — `POST /agents/submit`'s 5/minute limit and that
  reads use the higher 60/minute default.
- `test_regression_flagged_only.py` — regression coverage for a bug found
  and fixed during the backend port: `flagged_only=true` combined with
  `SELECT DISTINCT` used to throw a Postgres `InvalidColumnReferenceError`
  because the `ORDER BY` expression didn't appear literally in the select
  list. Covers both `GET /agents` and `GET /public/agents`, plus the
  `flagged_only` + `q` combination (which exercises two different
  `SELECT DISTINCT` branches in `query_agents` at once).

## CI

`.github/workflows/tests.yml` runs this suite on every push/PR using a
`postgres:16` service container, with dummy values for every secret —
nothing in the suite makes a real network call.
