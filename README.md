# Tracent

Tracent is the canonical trust and verification registry for AI agents — Crunchbase + Clearbit for the agent economy. Developers and autonomous AI agents query Tracent before integrating or transacting with an unknown agent. Every agent gets a universal **Tracent ID** (`trc_...`) that works across all data sources. Agents can be auto-verified on-chain or human-reviewed (Tracent-verified) for the highest trust tier.

---

## Local Setup

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in ALCHEMY_API_KEY, DATABASE_URL, API_KEY

# 3. Generate an API key
openssl rand -hex 32

# 4. Start the server
uvicorn app.main:app --reload
```

On startup, Tracent creates the database schema, runs an initial blockchain index, and starts the background scheduler.

---

## API Reference

All routes require `X-API-Key: <your-key>` header.

### Health

```bash
curl http://localhost:8000/health
# {"status": "ok"}
```

### Agent Lookup

```bash
# List agents (paginated + filtered)
curl -H "X-API-Key: $API_KEY" \
  "http://localhost:8000/agents?page=1&page_size=20&verified=true&trust_tier=onchain"

# Get full agent profile by Tracent ID
curl -H "X-API-Key: $API_KEY" \
  http://localhost:8000/agents/trc_4kX9mNpQ2r

# Lookup by source + source_id
curl -H "X-API-Key: $API_KEY" \
  http://localhost:8000/agents/source/erc8004/4821

# List flagged agents
curl -H "X-API-Key: $API_KEY" \
  "http://localhost:8000/agents/flagged?severity=high"
```

**Query params for `GET /agents`:**
| Param | Type | Description |
|-------|------|-------------|
| `page` | int | Page number (default 1) |
| `page_size` | int | Results per page (max 100) |
| `source` | string | Filter by source (e.g. `erc8004`) |
| `verified` | bool | Filter by verification status |
| `trust_tier` | string | `onchain` or `tracent` |
| `a2a_only` | bool | Only agents with A2A endpoints |
| `mcp_only` | bool | Only agents with MCP endpoints |
| `x402_only` | bool | Only agents with x402 support |
| `flagged_only` | bool | Only agents with reputation flags |
| `safe_only` | bool | Only `safe_to_transact = true` agents |

### Trust Lookup (primary agent-to-agent route)

```bash
# Trust signal by Tracent ID
curl -H "X-API-Key: $API_KEY" \
  http://localhost:8000/trust/trc_4kX9mNpQ2r

# Trust signal by source + source_id
curl -H "X-API-Key: $API_KEY" \
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
# Submit a Tracent-verified request
curl -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"tracent_id": "trc_4kX9mNpQ2r", "requester_email": "dev@example.com"}' \
  http://localhost:8000/verify/request

# Check verification status
curl -H "X-API-Key: $API_KEY" \
  http://localhost:8000/verify/status/trc_4kX9mNpQ2r
```

### Admin

```bash
# Registry stats
curl -H "X-API-Key: $API_KEY" http://localhost:8000/admin/stats

# Manually trigger re-index
curl -X POST -H "X-API-Key: $API_KEY" http://localhost:8000/admin/index

# List pending verification reviews
curl -H "X-API-Key: $API_KEY" http://localhost:8000/admin/reviews

# Approve or reject a Tier 2 verification
curl -X POST -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"action": "approve", "reviewer_note": "Manually reviewed — all checks pass"}' \
  http://localhost:8000/admin/verify/trc_4kX9mNpQ2r
```

---

## Verification Tiers

| Tier | Value | How |
|------|-------|-----|
| Unverified | `null` | Agent is indexed but not checked |
| On-chain verified | `"onchain"` | Auto-assigned: exists on ERC-8004, endpoints live, zero ownership transfers, valid agent card |
| Tracent-verified | `"tracent"` | Human-reviewed by Tracent team (paid) |
| Tracent-hosted | `"tracent-hosted"` | Tracent wrote and runs this agent itself — see [`docs/hosting-architecture.md`](docs/hosting-architecture.md) |

**Risk score** (0.0 = clean, 1.0 = high risk):
- +0.4 if any ownership transfer detected
- +0.3 if 2+ transfers (rapid resale)
- +0.2 if no endpoints resolve
- +0.1 if agent card missing name or description

`safe_to_transact = true` requires `risk_score < 0.3` AND `verified = true`.

---

## Fly.io Deploy

```bash
# Create the app (first time)
fly apps create tracent-registry

# Set secrets
fly secrets set ALCHEMY_API_KEY=<your-alchemy-key>
fly secrets set DATABASE_URL=<postgres-connection-string>
fly secrets set API_KEY=$(openssl rand -hex 32)

# Deploy
fly deploy
```

---

## AWS RDS Setup

1. Create a PostgreSQL 15+ instance in RDS (same region as your Fly machine — `us-east-1` for `iad`).
2. Set the security group to allow inbound TCP 5432 from Fly.io's egress IPs (or use a VPC peering / Fly private networking tunnel).
3. Create a database named `tracent`:
   ```sql
   CREATE DATABASE tracent;
   ```
4. Set `DATABASE_URL` to the full connection string:
   ```
   postgresql://<user>:<password>@<rds-endpoint>:5432/tracent
   ```
5. Tracent creates the schema automatically on first startup.

---

## Identity Model

Every agent has a `tracent_id` (`trc_` + 10 random chars) that works across all data sources:

```
tracent_id: "trc_4kX9mNpQ2r"
  source:   "erc8004"        ← origin registry
  source_id: "4821"          ← token ID within that registry
```

Supported sources at launch: `erc8004` (Ethereum mainnet ERC-8004 Identity Registry).
Roadmap: `base`, `arbitrum`, `langchain`, `crewai` — adding a source only requires a new indexer config.
