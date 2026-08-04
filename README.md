# Genticspace

Genticspace is a marketplace and discovery registry for AI agents — search for one in plain English, compare real listings by trust tier, license, and deployment type, try it live in an isolated sandbox before adopting it, and get an installation guide grounded in the agent's actual repo. Every agent gets a universal identity (`trc_...`) that works across every source it's indexed from.

This started as a narrower on-chain trust API (the repo and its infra still carry the `tracent` name in places — `tracent_id`, `tracent-registry`). It's since grown into a full marketplace: a FastAPI + Postgres backend (`app/`) indexing agents from six sources, and a Next.js web app (`frontend/`) at [genticspace.com](https://genticspace.com) where most people actually use it. The API below still works and is real, but it's one integration path among several now, not the whole product.

---

## What's actually here

- **Multi-source discovery**: agents are indexed from GitHub, Hugging Face, npm, Futurepedia, Y Combinator, and the ERC-8004 on-chain identity registry — not just one source. Each gets normalized into the same schema and the same `trc_` identity.
- **Marketplace search**: plain-English search, filter by industry, license, deployment type, protocol support (A2A/MCP/x402), and trust tier.
- **Trust signals**: verification tier, a computed risk score, reputation flags, and real user reviews/ratings — see [Verification Tiers](#verification-tiers).
- **Sandbox Mode**: for any GitHub-sourced agent that declares a `genticspace.yaml` manifest, clones and runs the agent's actual repo in an ephemeral, network-locked Fly Machine — see [Sandbox Mode](#sandbox-mode).
- **Deployment guides**: AI-generated, README-and-codebase-grounded install instructions per agent, tailored to your experience level.
- **Accounts**: individual or business signup, following, favorites, reviews, and a company/org profile page per provider.
- **Admin moderation dashboard**: a real web UI (`/admin` on the frontend) over flags, listings, reviews, verification requests, and the sandbox kill switch — not just the curl examples below.

---

## Local Setup

```bash
# 1. Install dependencies (use the pinned lockfile for a reproducible install)
pip install -r requirements-lock.txt

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in ALCHEMY_API_KEY, DATABASE_URL, ADMIN_API_KEY, PARTNER_API_KEY

# 3. Generate an API key (run twice, once per key)
openssl rand -hex 32

# 4. Start the backend
uvicorn app.main:app --reload

# 5. In a separate terminal, start the frontend
cd frontend
npm install
npm run dev
```

On startup, the backend creates the database schema, runs an initial on-chain index, and starts the background scheduler (the source scrapers, README/deployment-guide backfills, endpoint health checks, and the sandbox manifest scan and run-reaper).

### Dependency pinning

`requirements.txt` lists direct dependencies with minimum versions (what the code needs); `requirements-lock.txt` pins every dependency, direct and transitive, to an exact version for reproducible installs in CI and production — **this is what the Docker build actually installs from**, so any new dependency needs to land in both files or the deployed image won't have it. Regenerate the lock file after changing `requirements.txt`:

```bash
pip install pip-tools
pip-compile --output-file=requirements-lock.txt requirements.txt
```

`pip-compile` resolves for the platform it runs on rather than producing a universal lockfile. If you regenerate on Windows, `pywin32` (a Windows-only dependency of `web3`) comes back as an unconditional pin instead of the `; platform_system == "Windows"`-guarded one it should be, which breaks installation on Linux CI/Docker. Re-add that marker to the `pywin32` line before committing — or add the missing entry by hand instead of regenerating wholesale, the way `sentry-sdk` was added.

---

## Sandbox Mode

Lets a user run a listed agent's real, unreviewed open-source code before deciding to adopt it — the highest-risk surface in the product, since it's arbitrary third-party code execution by design.

**Eligibility is self-serve, not curated**: any GitHub-sourced agent whose repo declares a `genticspace.yaml` (or `.genticspace/sandbox.yaml`) manifest with valid `runtime`/`run` fields becomes sandbox-ready automatically, via a periodic scan (`app/services/sandbox_manifest.py`). No admin has to approve an agent before it's runnable.

**Execution** (`sandbox/supervisor.py`, one ephemeral Fly Machine per run, its own Fly org so it has no network path to production regardless of misconfiguration):
1. Clone the repo (as the unprivileged `sandbox` user).
2. Lock down network to DNS + plain HTTP/HTTPS only — no arbitrary ports, no SMTP relay, no DB protocols.
3. Run the manifest's build command (as `sandbox`, network-locked, npm `postinstall`/`preinstall` scripts blocked).
4. Run the manifest's run command (same user, same network policy).
5. Stream logs back over a single-purpose token scoped to that one run; the machine self-destroys when the process exits, with a wall-clock timeout, a Fly-level `kill_timeout`, and a DB-side reaper as three independent backstops.

**Admin override**: `/admin/sandbox` lists every sandbox-ready agent and can force one off regardless of its manifest — a real kill switch (`sandbox_cohort` table, checked by `sandbox_runner.start_run()` before every run).

Known gaps, tracked in `docs/sandbox-hardening-plan.md`: no disk quota or process/fd cap yet (a polling watchdog, not a kernel-enforced limit, is the planned fix), no egress logging of what a sandboxed agent actually contacted, and no equivalent to the npm `postinstall` block for `pip`/`setup.py`.

---

## API Reference

`/agents/*`, `/trust/*`, and `/verify/*` (partner reads) require `X-API-Key: <partner-key>`.
`/admin/*` (destructive/moderation actions) requires `X-API-Key: <admin-key>` — a distinct key,
never shared with partners. See [Split API Keys](#split-api-keys) below.

### Health

```bash
curl http://localhost:8000/health
# {"status": "ok"}
```

### Agent Lookup

```bash
# List agents (paginated + filtered)
curl -H "X-API-Key: $PARTNER_API_KEY" \
  "http://localhost:8000/agents?page=1&page_size=20&verified=true&trust_tier=onchain"

# Get full agent profile by ID
curl -H "X-API-Key: $PARTNER_API_KEY" \
  http://localhost:8000/agents/trc_4kX9mNpQ2r

# Lookup by source + source_id
curl -H "X-API-Key: $PARTNER_API_KEY" \
  http://localhost:8000/agents/source/erc8004/4821

# List flagged agents
curl -H "X-API-Key: $PARTNER_API_KEY" \
  "http://localhost:8000/agents/flagged?severity=high"
```

**Query params for `GET /agents`:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number (default 1) |
| `page_size` | int | Results per page (max 100) |
| `source` | string | `github`, `huggingface`, `npm`, `futurepedia`, `yc`, or `erc8004` |
| `verified` | bool | Filter by verification status |
| `trust_tier` | string | `onchain` or `tracent` (displayed as "Genticspace-verified") |
| `a2a_only` | bool | Only agents with A2A endpoints |
| `mcp_only` | bool | Only agents with MCP endpoints |
| `x402_only` | bool | Only agents with x402 support |
| `flagged_only` | bool | Only agents with reputation flags |
| `safe_only` | bool | Only `safe_to_transact = true` agents |

### Trust Lookup (primary agent-to-agent route)

```bash
# Trust signal by ID
curl -H "X-API-Key: $PARTNER_API_KEY" \
  http://localhost:8000/trust/trc_4kX9mNpQ2r

# Trust signal by source + source_id
curl -H "X-API-Key: $PARTNER_API_KEY" \
  http://localhost:8000/trust/source/erc8004/4821
```

Response:
```json
{
  "tracent_id": "trc_4kX9mNpQ2r",
  "source": "erc8004",
  "source_id": "4821",
  "name": "MyAgent",
  "verified": true,
  "trust_tier": "onchain",
  "risk_score": 0.04,
  "safe_to_transact": true,
  "endpoints_live": true,
  "ownership_transfers": 0,
  "flags": [],
  "checked_at": "2026-01-29T12:00:00Z"
}
```

### Verification Requests

```bash
# Submit a Genticspace-verified request
curl -X POST -H "X-API-Key: $PARTNER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tracent_id": "trc_4kX9mNpQ2r", "requester_email": "dev@example.com"}' \
  http://localhost:8000/verify/request

# Check verification status
curl -H "X-API-Key: $PARTNER_API_KEY" \
  http://localhost:8000/verify/status/trc_4kX9mNpQ2r
```

### Admin

Also available as a real web UI at `/admin` on the frontend (flags, listings, reviews, verification requests, and the sandbox kill switch) — the curl examples below are the same actions via API.

```bash
# Registry stats
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/admin/stats

# Manually trigger re-index
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/admin/index

# List pending verification requests
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/admin/verification-requests

# List / moderate actual agent reviews
curl -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/admin/reviews
curl -X DELETE -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/admin/reviews/42

# Approve or reject a Tier 2 verification
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "approve", "reviewer_note": "Manually reviewed — all checks pass"}' \
  http://localhost:8000/admin/verify/trc_4kX9mNpQ2r

# Sandbox kill switch — force an agent off regardless of its manifest
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" http://localhost:8000/admin/sandbox/trc_4kX9mNpQ2r/disable
```

### Split API Keys

`ADMIN_API_KEY` and `PARTNER_API_KEY` are separate master keys (set as separate secrets — see
Fly.io Deploy below; if only the legacy `API_KEY` is set, both fall back to it rather than
failing to boot — see `app/config.py`). Additional per-client keys can be minted without
redeploying via:

```bash
curl -X POST -H "X-API-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"owner_email": "partner@example.com", "label": "Acme Corp", "scope": "partner"}' \
  http://localhost:8000/admin/api-keys
# {"api_key": "...", ...}  — shown once; only its hash is stored.
```

There's currently no page in the admin web UI for this — minting a scoped key today requires the curl call above with the master key, not just dashboard access.

Every mutating `/admin/*` call is recorded in the `admin_actions` table (actor, action, target, timestamp) for traceability.

---

## Verification Tiers

| Tier | Value | How |
|------|-------|-----|
| Unverified | `null` | Agent is indexed but not checked |
| On-chain verified | `"onchain"` | Auto-assigned: exists on ERC-8004, endpoints live, zero ownership transfers, valid agent card |
| Genticspace-verified | `"tracent"` | Human-reviewed by the Genticspace team (paid) |
| Genticspace-hosted | `"tracent-hosted"` | Genticspace wrote and runs this agent itself — see [`docs/hosting-architecture.md`](docs/hosting-architecture.md) |

**Risk score** (0.0 = clean, 1.0 = high risk):
- +0.4 if any ownership transfer detected
- +0.3 if 2+ transfers (rapid resale)
- +0.2 if no endpoints resolve
- +0.1 if agent card missing name or description

`safe_to_transact = true` requires `risk_score < 0.3` AND `verified = true`. This scoring model was built for the original on-chain-only registry and hasn't been extended with source-specific signals for the newer GitHub/Hugging Face/npm/Futurepedia/YC listings — most non-`erc8004` agents carry `trust_tier = null` until manually verified.

---

## Fly.io Deploy

Three separate Fly apps: `tracent-registry` (this backend), `tracent-app` (the Next.js frontend), and `tracent-sandbox` (the sandbox execution image — no standing service, exists only so `fly deploy -c fly.sandbox.toml --app tracent-sandbox --build-only --push --image-label latest` can build and push the image real runs use; the `--image-label latest` is required, plain `--build-only --push` does not update the `:latest` tag).

```bash
# Create the app (first time)
fly apps create tracent-registry

# Set secrets
fly secrets set ALCHEMY_API_KEY=<your-alchemy-key>
fly secrets set DATABASE_URL=<postgres-connection-string>
fly secrets set ADMIN_API_KEY=$(openssl rand -hex 32)
fly secrets set PARTNER_API_KEY=$(openssl rand -hex 32)

# Deploy — always --no-cache; the remote builder has served stale cached
# layers against unchanged source more than once
fly deploy --no-cache
```

---

## AWS RDS Setup

1. Create a PostgreSQL 15+ instance in RDS (same region as your Fly machine — `us-east-1` for `iad`).
2. Set the security group to allow inbound TCP 5432 from Fly.io's egress IPs (or use a VPC peering / Fly private networking tunnel).
3. Create a database:
   ```sql
   CREATE DATABASE genticspace;
   ```
4. Set `DATABASE_URL` to the full connection string:
   ```
   postgresql://<user>:<password>@<rds-endpoint>:5432/genticspace
   ```
5. The backend creates the schema automatically on first startup.

---

## Identity Model

Every agent has a `tracent_id` (`trc_` + 10 random chars) that works across every source it's indexed from:

```
tracent_id: "trc_4kX9mNpQ2r"
  source:   "erc8004"        ← origin registry/platform
  source_id: "4821"          ← ID within that source
```

Live sources today: `github`, `huggingface`, `npm`, `futurepedia`, `yc` (Y Combinator), and `erc8004` (Ethereum mainnet ERC-8004 Identity Registry) — this repo's schema and trust-scoring were originally built around `erc8004` alone, so the risk/verification model above is more mature for on-chain agents than for the newer sources. Adding another source means a new scraper service plus a normalization pass into the shared `agents` table, not a schema change.

---

## Testing

```bash
pip install -r requirements-lock.txt
pytest
```

Real Postgres, no mocking (see `tests/conftest.py` — spins up a disposable `_test`-suffixed sibling database, drops it after). Currently covers auth, JWT, and agent-query filtering (47 tests); the sandbox execution path, the admin routes, and the two-tier API key auth system have no test coverage yet.
