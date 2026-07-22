# Agent hosting architecture (design spike)

> Ported from the `Info-gen` exploratory branch, unchanged in substance. A
> few cross-references below point at docs (`adding-a-source.md`,
> `discovery-api.md`, `local-dev-seed-data.md`) and a README "Roadmap"
> section that exist on `Info-gen` but have not (yet) been separately
> ported into this branch — those are called out inline rather than left as
> silently broken links. Everything else — the hosting-approach comparison,
> the hosted-agent contract, the deploy-pipeline sketch, the proof of
> concept, and the open questions — applies to this branch exactly as
> written.

This is a **design spike**, not a build. It proposes how Genticspace would run
agent code itself — starting with a small number of first-party
Genticspace-built agents (agent hosting/runtime as a roadmap item — see the
note above on the README roadmap section) — without committing to a
hosting provider or spending any money. Everything here is either a written
proposal or a proof-of-concept that runs **entirely on the local machine**,
clearly labeled as such. No cloud account was created, no credentials were
provisioned, and nothing here incurs cost.

Today, Genticspace is a pure registry: `app/services/indexer.py` and
`app/services/ard_crawler.py` discover agents whose `a2a_endpoint` /
`mcp_endpoint` / `web_endpoint` live somewhere else, and the `agents` table
(`app/db/database.py`) just stores pointers to them. This doc is about the
new case where Genticspace *is* the somewhere-else — where `agents.source =
'genticspace-hosted'` and Genticspace's own infrastructure serves those endpoints.

---

## 1. Hosting approach comparison

Four ways to run small, isolated agent processes, evaluated on cost,
isolation, cold-start latency, and fit with Genticspace's existing Fly.io setup
(`fly.toml`, `Dockerfile` — a single always-on `genticspace-registry` app, 1
shared CPU, 512MB, deployed via `fly deploy`).

| | **Fly Machines** | **Modal** | **AWS Fargate/ECS** | **Docker-per-agent on a VM** |
|---|---|---|---|---|
| **Isolation** | Firecracker microVM per Machine — hardware-level, same primitive Fly.io itself runs tenants on | gVisor sandboxing per container — strong, but a shared-kernel model (syscall interception, not a separate VM) | Firecracker microVM per task (same underlying tech as Fly Machines) | Whatever the container runtime gives you by default — shared host kernel, no extra isolation unless you bolt on gVisor/Kata yourself |
| **Cost model** | Per-second billing while running; ~$1.94–2/mo for an always-on 256MB shared-CPU machine, effectively $0 at rest with autostop | Per-second billing, base rate ~$0.0000131/CPU-core-sec before regional/preemption multipliers (~3.75x for non-preemptible US) | $0.04048/vCPU-hr + $0.004445/GB-hr (us-east-1), billed to the minute, 1-minute minimum | Whatever the VM costs, running 24/7 regardless of agent activity — cheapest per-hour at idle, most wasteful at low utilization |
| **Cold start** | Sub-second to a few seconds for a stopped Machine restart; faster (near-instant) if suspended instead of stopped | Sub-second on warm pools; multi-second on a cold image pull | Historically the slowest of the three — ENI provisioning + image pull commonly puts first-request latency in the 10s-of-seconds range | Effectively zero if the container is already running (but then it's not really an isolated per-agent boundary — it's always-on shared compute) |
| **Fit with existing Fly.io setup** | Same account, same `Dockerfile`/build path Genticspace already uses, same `fly deploy` muscle memory — Machines are just programmatically-created instances of that same primitive, addressable via the [Machines API](https://fly.io/docs/machines/guides-examples/managing-machines-with-the-api/) | New vendor, new billing account, new SDK/deploy model (Modal's Python-decorator-based deploy, not Dockerfile-first) — good product, but a second cloud surface to operate | New vendor (AWS), and even though Genticspace already documents an AWS RDS setup in the README, Fargate/ECS means a new VPC, ALB or API Gateway, ECS cluster + task definitions, and IAM roles — a lot of new surface for a spike | No new vendor, but no multi-tenant isolation primitive either — you're building the isolation boundary yourself (namespaces, cgroups, or a sandboxing layer) rather than getting it from the platform |

### Recommendation: Fly Machines

Recommended, for three reasons specific to Genticspace's situation rather than
Fly Machines being abstractly "best":

1. **Zero new operational surface.** Genticspace already deploys to Fly via a
   `Dockerfile` and `fly.toml`. Fly Machines are created from the same
   image-build pipeline — `fly deploy` already builds and pushes an image to
   `registry.fly.io`; hosting agents is "do that N more times, once per
   agent, and don't attach an `[http_service]`/`min_machines_running` the
   same way," not "learn a second platform."
2. **Strong default isolation with per-agent granularity.** Each Machine is
   its own Firecracker microVM. That matters a lot once this extends beyond
   Genticspace's own agents to third-party code (see [Open questions](#5-open-questions--risks)) —
   it's a materially different security posture than N containers sharing
   one kernel on a single Docker-per-agent VM.
3. **Cost shape matches "a small number of first-party agents."** Per-second
   billing plus `auto_stop_machines` means an idle hello-world-style agent
   costs close to nothing between requests, without needing to build
   autoscaling logic — Fly's proxy does the stop/start.

Where this recommendation would change: if/when Genticspace needs GPU-backed
agents or heavy batch/ML workloads, Modal's per-second GPU billing and
warm-pool model is purpose-built for that in a way Fly Machines isn't. If
Genticspace ever needs deep AWS-native integration (IAM-scoped access to other
AWS services, VPC peering into existing AWS infra — note the README already
documents an RDS setup), Fargate becomes more attractive despite the setup
cost. Neither applies to the current ask (a hard-coded hello-world MCP
echo agent), so this doc doesn't treat them as live options.

**This is a recommendation, not a provisioning action** — no Fly Machines
were created for this spike; see [§4](#4-proof-of-concept-local-simulation-only).

---

## 2. The Genticspace Hosted Agent Contract

Every agent Genticspace hosts directly (`agents.source = 'genticspace-hosted'`) must
satisfy this contract. It plays the same role for hosted agents that
`docs/adding-a-source.md` plays for discovery sources on the `Info-gen`
branch this doc was ported from (that doc has not itself been ported into
this branch yet): it's the interface the rest of the system is written
against, so that adding the next hosted agent doesn't require touching the
deploy pipeline or the registry code.

### 2.1 Runtime requirements

An agent must ship a container that:

1. **Listens on `0.0.0.0:$PORT`** (the platform injects `PORT`; default to
   `8080` if unset, matching `agents/hello-world/Dockerfile`).
2. **Exposes `GET /health`**, returning `200` once the process is ready to
   serve traffic. This is what the deploy pipeline's post-deploy check and
   Genticspace's existing `app/services/endpoint_checker.py`-style liveness
   probing hook into.
3. **Exposes at least one of:**
   - `POST /mcp` — MCP-compatible, JSON-RPC 2.0, implementing at minimum
     `initialize`, `tools/list`, and `tools/call`, or
   - an A2A-compatible endpoint (agent card + task endpoints, per the A2A
     spec Genticspace's `a2a_endpoint` column already assumes for
     externally-tracked agents).

   This mirrors the existing schema: a hosted agent populates
   `mcp_endpoint` and/or `a2a_endpoint` exactly like an externally-discovered
   one does — hosting doesn't add a new endpoint *type*, only a new
   `source` value for where that endpoint happens to run.
4. **Builds from either:**
   - its own `Dockerfile` (full control — what `agents/hello-world/` does), or
   - a future Genticspace-provided base image (`FROM genticspace/agent-base-python`
     or similar) plus just application code, for agents that don't need
     anything custom in the image. **Not built in this spike** — flagged as
     an open question in §5, since it implies committing to a supported
     runtime/language upfront.
5. **Declares no required outbound network access beyond what's needed to
   serve requests**, by default. Agents that need to call external APIs
   (the eventual common case) should be the exception that's explicitly
   declared, not the default — see §5 on egress control.

### 2.2 Manifest

Alongside the Dockerfile, an agent ships a `genticspace.yaml` manifest — the
hosted-agent equivalent of the "expected data shape" JSON block in
`adding-a-source.md`'s off-chain source spec (again, that doc lives on
`Info-gen`, not yet on this branch). This is what the deploy pipeline reads
to populate the `agents` / `agent_skills` rows:

```yaml
name: hello-world
description: >
  One or two sentences — this maps straight to agents.description.
provider_org: Genticspace
runtime: docker            # docker | (future) genticspace-base-python, etc.
port: 8080                 # container must listen on $PORT (defaults to this)
health_path: /health
mcp_path: /mcp              # and/or a2a_path, per §2.1
skills:
  - id: echo
    name: Echo
    description: Echoes back whatever text you send it.
    tags: [demo, utility]
```

Field mapping into the schema:

- `agents.source` = `'genticspace-hosted'`
- `agents.source_id` = the manifest's `name` (a stable slug — unique within
  `source = 'genticspace-hosted'`, enforced by the existing
  `UNIQUE(source, source_id)` constraint)
- `agents.name`, `agents.description`, `agents.provider_org` — straight
  from the manifest
- `agents.mcp_endpoint` / `agents.a2a_endpoint` = `https://<deployed-host>` +
  `mcp_path` / `a2a_path`
- `agents.web_endpoint` = the container's root path, if it serves one
- `agent_skills` rows — one per `skills[]` entry, same shape
  `indexer.py`'s skill loop and `ard_crawler.py` already use

### 2.3 Reference implementation

`agents/hello-world/` in this repo is a real (if intentionally trivial)
implementation of this contract:

- `agents/hello-world/app.py` — FastAPI app: `GET /health`, `GET /`, and
  `POST /mcp` implementing `initialize` / `tools/list` / `tools/call` with
  one tool (`echo`) that returns whatever text it's given.
- `agents/hello-world/Dockerfile` — builds and runs it, listening on `$PORT`.
- `agents/hello-world/genticspace.yaml` — the manifest described above.

Any future first-party agent should look like this directory: self-
contained, contract-conformant, no assumptions about where it's deployed
baked into the code.

---

## 3. Deploy pipeline sketch (design only — not implemented)

End-to-end, for a Fly-Machines-backed deployment:

```
 source                build                deploy                  register
┌──────────────┐    ┌───────────────┐    ┌───────────────────┐    ┌───────────────────────┐
│ agents/<slug>/│───▶│ docker build   │───▶│ fly machines run   │───▶│ upsert into `agents`   │
│  Dockerfile   │    │ (validates     │    │ (or `update`, for  │    │  (source=              │
│  genticspace.yaml │    │  contract:     │    │  redeploys) in a   │    │   'genticspace-hosted',    │
│  app code     │    │  /health,      │    │  Genticspace-owned Fly │    │   source_id=<slug>,    │
│               │    │  /mcp present) │    │  app; image comes  │    │   mcp_endpoint=        │
│               │    │  push to       │    │  from registry.    │    │   https://<slug>.      │
│               │    │  registry.     │    │  fly.io, same as   │    │   fly.dev/mcp, ...)    │
│               │    │  fly.io        │    │  `fly deploy` today│    │  + agent_skills rows   │
└──────────────┘    └───────────────┘    └───────────────────┘    └───────────────────────┘
```

Step by step:

1. **Source.** Each first-party agent lives at `agents/<slug>/` in this repo
   (as `agents/hello-world/` does), or — once this extends past a handful of
   Genticspace-built agents — its own repo, still required to satisfy the
   contract in §2.
2. **Build.** CI builds the Dockerfile and, before pushing anything,
   validates the contract mechanically: does `genticspace.yaml` parse, does the
   image expose the declared port, does a container instance answer
   `GET /health` with `200` and `POST /mcp` with a valid `initialize`
   response. This is the gate that would eventually stand between "someone
   submitted an agent" and "it's running on Genticspace's infrastructure" —
   critical once this isn't just Genticspace's own code (§5). Push the built
   image to `registry.fly.io`, the same registry `fly deploy` already
   pushes to.
3. **Deploy.** Create or update a Fly Machine running that image, in a
   Genticspace-owned Fly app. Open question folded into this step, deliberately
   not resolved here: **one shared Fly app with one Machine per agent**
   (simpler org-level config, cheaper, but agents share an app-level
   network/security boundary) vs. **one Fly app per agent** (stronger
   blast-radius isolation, matches Fly's own multi-tenant patterns more
   closely, but N apps to manage). For a handful of first-party agents this
   barely matters; it matters a lot once third parties are hosting
   semi-trusted code (§5).
4. **Register.** Upsert a row into `agents` with `source = 'genticspace-hosted'`,
   `source_id = <slug>`, and endpoint columns pointing at the deployed
   Machine's public hostname — the production version of what
   `scripts/register_hosted_agent.py` does by hand for this spike's proof of
   concept (§4). In production this step runs as part of CI/CD, not as a
   manually-invoked one-off script.

Not designed here (explicitly out of scope for this spike, flagged for
later): rolling updates/rollback of a running agent, log/metric collection
per agent, and what happens to the `agents` row when a deploy fails
mid-pipeline.

---

## 4. Proof of concept (local simulation only)

**This is a local simulation, not a real cloud deployment.** No Fly.io
Machine, AWS resource, or Modal sandbox was created. Nothing here was
signed up for and nothing costs money. Per the task's safety constraint,
that's deliberate: no hosting provider has been chosen for real yet, and
provisioning one isn't a decision to make unilaterally.

### What was built

- `agents/hello-world/app.py`, `Dockerfile`, `genticspace.yaml` — the reference
  agent from §2.3: a hard-coded MCP echo server satisfying the hosted-agent
  contract. The Dockerfile is real and would build/run in a real container
  runtime; it just wasn't pushed anywhere.
- `scripts/run_hello_world_agent.py` — runs `agents/hello-world/app.py`
  **as a bare local process** on a non-default port (`127.0.0.1:8090` by
  default), standing in for "a Fly Machine somewhere" until one exists.
- `scripts/register_hosted_agent.py` — a one-off script (same `ON CONFLICT
  (source, source_id)` upsert key and `genticspace_id` generation as
  `app/services/indexer.py::_generate_genticspace_id` used elsewhere in this
  repo; modeled on the `Info-gen` branch's `scripts/seed_demo_agents.py`
  upsert pattern, which has not itself been ported here) that inserts one
  row into `agents` with `source = 'genticspace-hosted'`, `source_id =
  'hello-world'`, and `mcp_endpoint` / `web_endpoint` pointing at wherever
  the agent is actually reachable — `http://127.0.0.1:8090` by default,
  overridable via `--mcp-endpoint`/`--web-endpoint` for when a real
  deployment exists.

### How it was verified

1. Started a local PostgreSQL instance and created a database.
2. Started the Genticspace backend locally (`uvicorn app.main:app`) against
   that database, with dummy values for `ALCHEMY_API_KEY` / `API_KEY` /
   `JWT_SECRET` — the app starts fine.
3. Started the hello-world agent: `python -m scripts.run_hello_world_agent
   --port 8090`. Confirmed it's actually live:
   ```
   $ curl http://127.0.0.1:8090/health
   {"status":"ok","agent":"genticspace-hello-world"}

   $ curl -X POST http://127.0.0.1:8090/mcp -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"echo","arguments":{"message":"hello from genticspace"}}}'
   {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"hello from genticspace"}],"isError":false}}
   ```
4. Registered it: `python -m scripts.register_hosted_agent`, which printed
   the assigned ID (will differ on re-run since IDs are random, matching
   `_generate_genticspace_id`'s behavior for every other source).
5. Queried the **running Genticspace backend's own API** — not the database
   directly — and confirmed the hosted agent comes back exactly like any
   other agent would, both via the key-gated `GET /agents/{genticspace_id}` and
   the public, no-key `GET /public/agents/{genticspace_id}`, each reporting
   `"trust_tier": "genticspace-hosted"` and `"trust_summary": "genticspace_hosted"`.

`localhost` endpoints in the registered row are expected and correct for
this simulation — they describe exactly where the agent is actually
reachable right now (nowhere durable), which is the honest thing for the
registry to say until a real deployment exists.

### What a real deployment would require (open question for the human)

Turning this into an actual Fly Machines deployment needs, at minimum:
a decision to actually spend the (small, but nonzero) money and ops time on
this — the Fly.io account already exists (`genticspace-registry` is already
deployed there), so no *new* signup is needed for Fly specifically, but
provisioning a new app/Machines for agent hosting is still a real
infrastructure and billing decision that wasn't made here. It would also
need: secrets/env management for agent-specific config, a decision on the
shared-app-vs-per-app-per-agent question from §3, and a real domain/DNS
answer for `mcp_endpoint` instead of `127.0.0.1`. None of this was
provisioned — this section exists so the human reviewing this doc has the
concrete next step spelled out rather than left implicit.

---

## 5. Open questions & risks

**Sandboxing/security model, once this opens beyond Genticspace's own agents.**
Fly Machines' Firecracker isolation is a reasonable baseline for
*Genticspace-authored* code, where the risk is "we wrote a bug," not "someone
is actively trying to escape the sandbox." That baseline is not sufficient
once third parties can submit arbitrary Dockerfiles: needs image
scanning/static analysis before an untrusted build ever runs, an explicit
egress allowlist (§2.1 assumes no outbound access by default, but nothing
enforces that yet), and a threat model for what a malicious agent could do
to *other tenants* on shared infrastructure (this is exactly why the
shared-app-vs-per-app isolation question in §3 matters more once this
happens).

**Resource limits.** Nothing in this spike defines CPU/memory quotas,
per-agent concurrent-connection limits, or execution timeouts. A hard-coded
echo agent doesn't need them; a hosting platform open to arbitrary agent
code absolutely does — without limits, one runaway or malicious agent can
degrade or take down everything sharing its infrastructure.

**Cost per agent.** Fly Machines' per-second billing keeps an idle agent
close to free, but "close to free" isn't "free," and it doesn't model what
happens at agent-count scale (10 agents idling is cheap; 10,000 is not, and
neither is one agent that's genuinely busy). No cost model or per-agent
budget was built here — that's real work, not a spike-sized task.

**Billing/metering.** Hosting introduces compute cost with no
usage-metering story yet to attribute it — the indexer only tracks
externally-hosted endpoints, so there's never been compute cost to
attribute to anyone before now. Minimum pieces a real billing story needs:
per-agent usage metering (request count and/or CPU-seconds, which the Fly
Machines API can expose), a way to attribute that cost to whoever owns the
agent (trivial while it's only Genticspace's own agents — all costs land on
Genticspace; not trivial once third parties host here), and a decision on who's
charged what. This presupposes tenant identity in a way that's now
substantially less hypothetical on this branch than when this section was
originally written: this branch already has per-client API keys
(`app/db/auth.py`, `api_keys` table) and rate limiting (`app/rate_limit.py`)
as of the backend integration pass that merged those in alongside this doc
— but neither of those is usage metering or cost attribution, so this open
question stands as-is.

**`trust_tier` doesn't have a clean value for hosted agents. — Resolved.**
Discovered while building the proof of concept: neither `'onchain'` (implies
ERC-8004 registration — a hosted agent has no `owner_address`, no
`registered_block`/`registered_tx`) nor `'genticspace'` (documented as
"human-reviewed... paid" — doesn't quite describe "Genticspace wrote and runs
this itself") is a precise fit. Resolved by adding a dedicated
`trust_tier = 'genticspace-hosted'` value, mapped to its own `"genticspace_hosted"`
label in `app/services/trust_summary.py` (kept distinct from
`"genticspace_verified"`, which specifically means a human reviewed a
*third-party* agent). `scripts/register_hosted_agent.py` was updated to
match; a corresponding `discovery-api.md` label-table update has not been
made since that doc doesn't exist on this branch yet.
`safe_to_transact` still stays `false` for these rows, matching the existing
convention that only auto-verification sets that flag.

**Update/redeploy story.** Not designed here at all — §3 explicitly scopes
it out. How an already-running agent gets a new version deployed (rolling
Machine replacement, versioned images, rollback on a bad deploy) needs its
own design pass before this goes past "one hard-coded agent."

**Observability.** No logging or metrics pipeline for hosted agent
processes is defined. `app/services/endpoint_checker.py`'s existing
liveness-checking model (poll and record `endpoints_live`) is a natural
starting point but wasn't extended here.

---

## See also

- `docs/adding-a-source.md` — the equivalent contract doc for *discovering*
  externally-hosted agents, which this doc's §2 deliberately mirrors in
  style, on the `Info-gen` branch. Not present on this branch.
- `docs/local-dev-seed-data.md` — the demo-data seeding pattern
  `scripts/register_hosted_agent.py` is modeled on, on the `Info-gen`
  branch. Not present on this branch.
- README.md's "Roadmap: from registry to discovery hub" section (present on
  `Info-gen`, not on this branch's current README) — item 3 there is this
  doc's mandate; item 4 (public-facing auth model) is largely addressed on
  this branch already via per-client API keys and rate limiting, per the
  note in §5's billing/metering entry above.
