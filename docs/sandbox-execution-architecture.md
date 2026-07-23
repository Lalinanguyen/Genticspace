# Sandbox execution architecture for third-party agent code (design spike)

This is a **design spike**, not a build. It is the Track B counterpart to
`docs/hosting-architecture.md`: that doc is a design spike for how Genticspace
would run **its own, first-party** agent code (`agents.source =
'genticspace-hosted'`); this doc is the equivalent spike for running **someone
else's** agent code — a GitHub repo or HuggingFace model a third party
published, with no live endpoint we can just embed.

Sandbox Mode's Track A (already shipped, not touched by this doc) covers the
case where a third-party agent already has something live and embeddable: an
open-source HuggingFace Space. `app/services/agent_queries.py`'s
`compute_sandbox_fields()` sets `sandboxable = True` for those and points
`sandbox_url` at the Space's own page — no code runs on Genticspace's
infrastructure, we just link to code already running on HuggingFace's. That
covers HF Spaces and nothing else: a GitHub repo's `web_endpoint` is just the
repo's own webpage, and a plain HF model/dataset has no served UI at all.
Track B is what it would take to actually run that code ourselves, for the
GitHub-repo and HF-model agents Track A structurally cannot cover.

**Nothing in this doc executes anything.** No image is built, no sandbox is
provisioned, no untrusted code runs. This is a written proposal plus light
schema/script scaffolding for recording an admission decision — the same
"proof of concept only ever runs the local hello-world agent by hand"
discipline `hosting-architecture.md` §4 applies to first-party hosting
applies here even more strictly, because this is arbitrary third-party code
rather than something Genticspace wrote itself.

---

## 1. The curated-cohort approach

Real execution of third-party code, if and when it's built, only ever
happens for a small, manually hand-picked set of agents — never
automatically, never unbounded, never triggered by a user simply clicking
"try this." That constraint isn't a phase-one simplification to relax
later; it's the load-bearing assumption the rest of this doc depends on.
Nothing here proposes a self-service pipeline where any repo with an
`Open Source` license string starts executing.

**Gating condition:** `agents.license = 'Open Source'`. This is the same
literal string `compute_sandbox_fields()` already checks
(`app/services/agent_queries.py:41`, `sandboxable = is_space and
d.get("license") == "Open Source"`) — Track B's eventual sandboxable flag
for GitHub/HF-model agents is meant to extend that exact same field and
value, not invent a second, competing notion of "sandboxable." An agent
that isn't `license = 'Open Source'` is never eligible for the cohort,
full stop, regardless of anything else about it.

But license match is only the *floor* — it narrows "every agent in the
registry" down to "agents it's even legally plausible to consider," not
down to "agents we run." Membership in the actual cohort requires, on top
of that:

1. A human explicitly admitting the agent (§3.2) — never automatic.
2. Passing the security baseline in §2 before the admission's `status` can
   move past `pending_security_review`.
3. A legal/licensing check beyond the license string match (§4).

The `sandbox_cohort` table added in this pass (`app/db/database.py`)
exists to record step 1 only. It has no relationship to steps 2 or 3
actually having happened — see §5's explicit scope boundary.

---

## 2. Mandatory security baseline

None of this is built yet. This section specifies what must exist and be
verified working — not "designed," not "partially wired up" — before a
single cohort agent's code runs for the first time, live, anywhere. Each
item below is written operationally: what it means to actually have it,
not just the buzzword.

### 2.1 Image scanning / static analysis

Before an admitted agent's build is ever run, the built image (or, if a
build step doesn't exist yet, the raw source) must go through:

- **Dependency/CVE scanning** (e.g. Trivy, Grype, or an equivalent SCA
  tool) against the image's OS packages and language-level dependency
  manifest (`requirements.txt`, `package.json`, etc.), with a documented
  severity threshold that blocks admission (e.g. no unpatched Critical/High
  CVEs with an available fix).
- **Static analysis of the agent's own code** for the patterns that matter
  most for a sandboxed-execution threat model specifically: dynamic code
  execution (`eval`/`exec`/`pickle.loads` on untrusted input), shelling out,
  filesystem access outside an expected working directory, and use of
  known-dangerous or obfuscation-favoring constructs. This is not a
  guarantee of "safe code" — static analysis can't prove that — it's a
  gate that catches unambiguous red flags before a human reviewer's time is
  spent on the rest of admission.
- **A recorded scan result per cohort entry**, not a one-time check that's
  never repeated. If the agent's upstream source changes (a redeploy, a new
  commit pulled in), the scan must re-run before the new build replaces the
  old one — this doc does not design that re-scan trigger, it only requires
  that whatever build pipeline eventually exists (explicitly out of scope
  here — see §5) treats "unscanned" and "failed scan" as blocking, not
  advisory.

### 2.2 No outbound network access by default

Every cohort agent's runtime environment must default to **zero outbound
network access** — not "limited," not "logged," actually zero, enforced at
the network/sandbox boundary (not just "the agent's code doesn't happen to
make outbound calls"). Concretely, this means:

- The container/microVM's network namespace has no route to the public
  internet, to Genticspace's own internal services, or to other tenants'
  sandboxes, unless explicitly granted.
- An **egress allowlist**, scoped per cohort entry, is the only mechanism
  for an agent to reach anything external — e.g. "this agent is allowed to
  call `api.openai.com` and nothing else." Granting an allowlist entry is
  itself part of the human admission review (§3.2), not something an agent
  can request or expand at runtime.
- The allowlist default for a newly admitted agent is empty. An agent that
  needs external network access to function at all is a heavier review
  case than one that doesn't, and should be treated that way rather than
  granted broad egress "to get it working."

This directly extends the open question `hosting-architecture.md` §2.1
flags but leaves unenforced for first-party agents ("declares no required
outbound access by default... nothing enforces that yet") — for
third-party code, "nothing enforces that yet" is not an acceptable
starting state; enforcement has to exist before any cohort agent runs, not
after.

### 2.3 CPU/memory/timeout resource quotas

Every cohort agent's execution must run under hard, enforced resource
limits, not soft guidance:

- **CPU:** a fixed share (e.g. Fly Machines' `shared-cpu-1x`/`performance-*`
  sizing, or the equivalent cgroup CPU quota if the eventual runtime is
  container-based rather than microVM-based) that a runaway agent cannot
  exceed regardless of what its code does.
- **Memory:** a hard ceiling with OOM-kill (not swap, not degraded
  performance) as the enforcement mechanism when exceeded — an agent that
  tries to allocate past its limit gets killed, not throttled into
  affecting its neighbors.
- **Execution timeout:** a wall-clock limit per invocation (not per
  container lifetime) after which the agent's process is forcibly
  terminated, independent of whether it's making progress. A "try this
  agent" interaction is inherently interactive/short-lived; anything that
  wants long-running background execution is a different, not-yet-designed
  product shape and out of scope for sandbox trials.
- All three limits must be **agent-specific and admin-configurable at
  admission time**, not one global constant — a cohort agent that
  legitimately needs more memory (e.g. a small local model) is a review
  decision, not something it can request for itself.

This is the concrete version of the open question `hosting-architecture.md`
§5 leaves unresolved even for first-party agents ("Nothing in this spike
defines CPU/memory quotas... A hosting platform open to arbitrary agent
code absolutely does").

### 2.4 Documented kill-switch

An admin must be able to immediately stop a misbehaving cohort agent from
running, at any time, without a deploy or code change. Concretely, before
any cohort agent runs live, there must be:

- A single, fast administrative action — e.g. `status` on the agent's
  `sandbox_cohort` row flips to a value like `killed`/`suspended`, and
  whatever eventually serves sandbox traffic (again, not built — see §5)
  checks that status before routing any request to the agent, refusing if
  it isn't `approved`.
- If the agent has an already-running instance (a live Machine/container)
  at the moment of kill, the switch must also tear that instance down —
  flipping a database flag that a not-yet-running dispatcher checks on the
  *next* request is not a kill-switch if a currently-running process keeps
  executing regardless. This doc does not design the teardown call itself
  (it depends on whatever runtime is eventually chosen — see §5), but
  requires that whatever admission/build tooling is eventually built wires
  the kill-switch to actual process teardown, not just a status flag that
  only affects future requests.
- The action must be usable by whoever holds admin access today — the
  master `API_KEY` / per-client keys in `app/db/auth.py` (see §3.1 on why
  that matters for `admitted_by` too) — without needing a new access-control
  system built first.

None of this is implemented in this pass. `sandbox_cohort.status` (§3) is
the field this kill-switch would eventually operate on, but nothing reads
that field to gate live traffic yet, because nothing serves live traffic
yet.

---

## 3. Third-party Hosted Agent Contract (extending §2 of `hosting-architecture.md`)

`hosting-architecture.md` §2 defines the **Genticspace Hosted Agent
Contract** for first-party agents: a Dockerfile plus a `genticspace.yaml`
manifest declaring runtime requirements (listen on `$PORT`, expose
`/health`, expose an MCP/A2A endpoint, declare no unnecessary egress). That
contract is the right starting point for third-party agents too — the
runtime shape of "a container that serves MCP or A2A on a health-checked
port" doesn't change based on who wrote the code inside it. What changes,
adapted for (a) code Genticspace didn't write and (b) an explicit human
review step before anything builds, is everything *around* the contract:

### 3.1 What's different for code we didn't write

- **The Dockerfile/manifest itself is part of what's reviewed, not just
  trusted input.** For a first-party agent, `genticspace.yaml` is Genticspace
  declaring its own agent's shape. For a third-party agent, the same file
  (or repo-provided equivalent) is a claim made by someone outside the
  org — the security baseline in §2 exists precisely because "the manifest
  says it needs no egress" isn't sufficient when the manifest's author
  isn't Genticspace.
- **The build step requires an explicit go/no-go a human makes**, not a CI
  gate that runs automatically on every registry addition. `hosting-
  architecture.md` §3's deploy pipeline sketch has CI validate the contract
  mechanically (does `/health` respond, does the port match) as a
  first-party build gate; for third-party code, mechanical contract
  validation is necessary but not sufficient — a human still has to decide
  "should this specific agent's code run on our infrastructure at all,"
  which is exactly what cohort admission (below) is for.
- **`agents.source` for these rows is whatever discovery already assigned**
  (`'github'`, `'huggingface'`, etc.) — cohort admission doesn't change an
  agent's `source`/`source_id` or claim Genticspace now "hosts" it in the
  `genticspace-hosted` sense; it's a separate, additive record that this
  *particular already-discovered* agent has been through admission review.

### 3.2 Admission is a human review step, not a form submission

Cohort admission is deliberately not self-service and not automatic. An
admin — today, meaning whoever holds the master `API_KEY` or a per-client
key from `app/db/auth.py` (there is no separate admin-user concept in this
codebase; `verify_api_key` doesn't distinguish "master" from "per-client"
callers, so in practice "admin" means "whoever runs the one-off script from
a trusted machine," per `scripts/admit_to_sandbox_cohort.py` added in this
pass) — looks at a specific agent and makes a manual admission decision.
That decision is recorded, not enforced, by the schema added here: a
`sandbox_cohort` row records *that* an admin decided to admit this agent
and *who*, with `status` starting at `pending_security_review` and moving
to `approved` only once §2's baseline genuinely exists and has actually
been run against this agent (manually, today — there is no automation to
flip this).

`manifest_path` on the `sandbox_cohort` row is where that agent's
Dockerfile/`genticspace.yaml`-equivalent would eventually live once one
exists — nullable, because for every agent admitted under this pass,
nothing has been written yet. Populating it is future work that depends on
someone actually authoring a manifest for a specific third-party repo,
which is itself downstream of the review in §4.

---

## 4. Legal / licensing review

`agents.license = 'Open Source'` is **necessary but not sufficient** for
running someone's code on Genticspace's own infrastructure, and this
distinction matters more here than anywhere else `license` is already used
in this codebase.

Track A's use of the same field (`compute_sandbox_fields`, linking to an
agent's own HuggingFace Space) only ever sends a user's browser to
infrastructure the third party already operates — Genticspace isn't
copying, redistributing, or executing anything. Track B's eventual cohort
execution is categorically different: it means pulling a third party's
code onto Genticspace-controlled compute and running it. That crosses from
"linking to" into "distributing and executing," which is exactly the point
at which license *terms*, not just the license *category*, start to
matter:

- "Open Source" as a checkbox on a self-submitted listing (or as a string
  scraped from a GitHub/HF license file) says nothing about *which* OSI-
  approved license applies. Several common ones carry obligations that are
  irrelevant for a hyperlink but very relevant once you're running the
  code: attribution requirements that must be surfaced somewhere in the
  running product (not just the original repo), copyleft terms that can
  have implications for anything Genticspace's own runtime links the
  agent's code against, and patent-grant clauses whose scope varies
  license-to-license.
- The `license` column as currently populated (self-reported on
  self-submitted listings, or scraped/inferred for indexed sources) is not
  itself a verified legal determination — it's a data field the automated
  `license = 'Open Source'` check treats as a coarse filter, correctly, for
  narrowing "the whole registry" down to "agents worth a human look." It
  was never meant to substitute for one.

**Recommendation:** cohort admission (§3.2) must include a human
legal-adjacent review step per agent — reading the actual license the
specific repo/model ships under (not trusting the scraped/self-reported
string alone), confirming it in fact permits redistribution and execution
on third-party infrastructure, and noting any attribution or notice
obligations that would need to be satisfied in the running product. This
is a per-cohort-entry review, not a one-time policy decision, because
different agents in the same cohort can carry different licenses with
different obligations. Nothing about this is automated by
`scripts/admit_to_sandbox_cohort.py` — the script enforces the
`license = 'Open Source'` floor mechanically (refusing admission outright
if it isn't set) precisely because that's the one part of this section
that *is* safe to check in code; the rest is exactly why the script can
never set `status = 'approved'` itself.

---

## 5. Explicitly out of scope for this doc

Named plainly, so nothing here is mistaken for having been built:

- **Automatic Docker builds from arbitrary repos.** No build pipeline
  exists. `sandbox_cohort.manifest_path` is a place to eventually point at
  one; nothing populates or consumes it yet.
- **Real Fly Machines provisioning (or any cloud infrastructure) for
  third-party code.** No account, app, Machine, or equivalent resource on
  any provider was created for this. `hosting-architecture.md`'s Fly
  Machines recommendation (§1 there) is reused here as the *starting
  point* for what a third-party runtime would use, precisely because its
  Firecracker microVM isolation is the baseline this doc's threat model
  (§2) assumes — but reusing the recommendation is not the same as
  provisioning it, and nothing was provisioned.
- **Actually executing any agent's code.** Nothing in this pass runs a
  third party's repo, model, or container, sandboxed or otherwise.
- **Security scanning integration.** §2.1 specifies what scanning must
  exist and mean; no scanner is wired into anything, because there is no
  build pipeline yet for it to scan the output of.
- **The kill-switch's actual mechanism.** §2.4 specifies the requirement;
  no admin action, API route, or teardown call exists yet — this pass adds
  only the `sandbox_cohort.status` column the kill-switch would eventually
  read and write.

Each of the above needs its own dedicated planning pass with real security
sign-off before it's built — not a continuation of this doc's scope, a
separate one. In particular, the security baseline in §2 is written at the
level of "what must be true," not "here is the implementation" — turning
each item into a concrete, reviewed design (which scanner, which isolation
primitive, which specific kill-switch mechanism) is exactly that follow-up
work, and none of it should be treated as done because this doc describes
what "done" needs to include.

---

## See also

- `docs/hosting-architecture.md` — the first-party counterpart this doc
  extends: the Fly Machines recommendation (§1), the Hosted Agent Contract
  (§2), the deploy pipeline sketch (§3), and its own "Open questions &
  risks" (§5) section, which flags third-party sandboxing as unresolved —
  this doc is that flag's follow-up.
- `app/services/agent_queries.py`'s `compute_sandbox_fields()` /
  `_hf_space_url()` — Track A's implementation of the `sandboxable` /
  `sandbox_url` fields for HF Spaces; Track B's eventual extension for
  GitHub/HF-model agents must extend this same field pair, per §1 above.
- `app/db/database.py`'s `sandbox_cohort` table — the schema this doc's §3
  describes, added in this pass.
- `scripts/admit_to_sandbox_cohort.py` — the admin script that records a
  cohort admission decision per §3.2 and §4's `license` floor check.
- `app/db/auth.py` — confirms there is no admin-user concept distinct from
  the master/per-client API key model referenced in §2.4 and §3.2.
