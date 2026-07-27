# Sandbox Mode hardening — Phase 0 recon and plan

Status: **recon complete, no code changed. Waiting for direction before Phase 1.**

## 0. The thing you need to see before anything else

The three components you described don't currently coexist on one branch. I
looked for all of them before writing anything below; here's what's actually
where.

| Component | Where it actually lives | Branch |
|---|---|---|
| (A) Real Fly Machine execution — `sandbox/supervisor.py`, `Dockerfile.sandbox`, `fly.sandbox.toml`, `app/services/fly_machines.py`, `app/services/sandbox_runner.py`, `app/routes/sandbox.py`, and the `RunConsole.tsx` that calls it | **`main`** (current branch, what's deployed to `genticspace.com`) | `main` only — does not exist on `deslop` at all |
| (B) HF-Space iframe + `POST /agents/{id}/sandbox/guide` + a *different* `RunConsole.tsx` that calls `getSandboxGuide` | `app/services/sandbox_guide.py`, `app/routes/public.py:281`, `frontend/components/agent/RunConsole.tsx` | **`deslop`/`origin/deslop`** only — not on `main` |
| (C) "Sandbox v2" mock — `SandboxTrialCockpit.tsx`, fixed demo agent "Atlas Vision," canned two-turn conversation | `frontend/components/agent/SandboxTrialCockpit.tsx` | **`deslop`/`origin/deslop`** only — not on `main` |
| `docs/sandbox-execution-architecture.md` | exists, but describes a *fourth*, unbuilt thing (see §0.2) | **`deslop`** only — `docs/` doesn't exist on `main` at all |
| The ~79-test, real-Postgres suite | `tests/` (7 files on `deslop`, incl. `test_sandbox.py`) | **`deslop`/`origin/deslop`** only — zero test files of any kind exist on `main` (`git ls-files | grep test` on `main` returns nothing) |

I verified this with `git ls-tree -r <branch> --name-only` against `main`,
`deslop`, `origin/deslop`, `origin/Testing-CI`, and the other local branches
— not by inference.

**What this means concretely:**

- Everything you asked me to read in Phase 0 that actually exists (A) is on
  `main`, and I read the real files there — the answers to your six
  questions below are accurate to what's deployed right now.
- (B) and (C), and the doc, exist only on `deslop`, which has never been
  merged. `deslop` in turn does **not** have (A) at all — no
  `supervisor.py`, no `fly_machines.py`. The two branches each have half of
  what you described.
- `deslop`'s `test_sandbox.py` (134 lines) tests component (B) — the
  sandboxable-flag computation and the guide endpoint's error paths. It does
  not and cannot test component (A), since (A) doesn't exist on that branch.
  **There is currently zero test coverage anywhere in this repo, on any
  branch, for the actual Fly Machine execution path.** Phase 2 has to be
  written from scratch, not extended.
- Phase 2 says "match that style" (referring to the ~79 tests). I can match
  the *convention* — real Postgres, no mocking, per `deslop/tests/conftest.py`
  — but there is no existing sandbox-path test to extend or pattern-match
  beyond that convention.

### 0.1 Decision this blocks

I need you to tell me which of these you want before Phase 1:

1. **Work on `main` only**, treat (B)/(C)/the doc as not part of this effort,
   and write new docs/tests from scratch for (A) as it exists today. Fastest,
   but ignores work that already exists on `deslop`.
2. **Merge `deslop` into `main` first**, then harden the merged result. Slower
   up front, resolves the fork, but `deslop` has its own 15-commit history
   and its own take on sandboxing (curated cohort, see below) that would need
   reconciling with (A)'s self-serve model — that reconciliation is a real
   design decision, not a mechanical merge.
3. **Cherry-pick specific files** from `deslop` (e.g. just the test
   conventions, or just the doc) without merging the branch wholesale.

I'm not picking one of these for you. Phase 1 as written assumes a single
coherent codebase to harden; right now there isn't one.

### 0.2 The doc you referenced says something that contradicts what's shipped

`docs/sandbox-execution-architecture.md` (on `deslop`) opens with:

> "This is a **design spike**, not a build... **Nothing in this doc executes
> anything.** No image is built, no sandbox is provisioned, no untrusted code
> runs."

It then specifies a **mandatory security baseline** — dependency/CVE
scanning, a manually-curated admission cohort (`agents.license = 'Open
Source'` is described as "only the *floor*," gated further by "a human
explicitly admitting the agent... never automatic"), and a legal review step —
that it says must exist and be verified working **before a single cohort
agent's code runs for the first time, live, anywhere.**

Component (A), on `main`, is already live, already runs real untrusted code
automatically, and has none of that: `app/services/sandbox_manifest.py`
scans every GitHub-sourced agent on a 12-hour cycle and flips
`sandbox_enabled = TRUE` the moment a repo's `tracent.yaml` validates — no
human in the loop, no CVE scan, no legal check, no cohort. Anyone with a
listed GitHub repo and a valid manifest is in.

I'm flagging this because Phase 1 as written (build isolation, resource
limits, egress allowlisting) hardens the *mechanics* of a self-serve model
that the one design document in this repo treats as unsafe to ship at all
without a manual gate in front of it. That's either a deliberate call you
already made (self-serve is the product, the doc is superseded) or a gap
nobody's reconciled yet. I'd want to know which before prioritizing Phase 1's
items relative to "should this be self-serve at all."

---

## 1. Answers to the six questions (component A, read on `main`)

### 1. Order of operations; which steps run third-party code; network access at each step

From `sandbox/supervisor.py`, `main()`:

```python
async def main() -> None:
    os.makedirs(WORKDIR, exist_ok=True)
    clone_code = await clone_repo()
    if clone_code != 0:
        await send(status="failed", exit_code=clone_code)
        return
    build_code = await run_step(BUILD_COMMAND, BUILD_TIMEOUT_SECONDS, "build")
    if build_code is None:
        await send(status="timeout"); return
    if build_code != 0:
        await send(status="failed", exit_code=build_code); return
    lock_down_network()
    run_code = await run_step(RUN_COMMAND, MAX_RUN_SECONDS, "run")
    ...
```

Order: **clone → build → lockdown → run.**

- `clone_repo()` runs `git clone --depth 1 --branch <ref> <REPO_URL> <WORKDIR>`
  directly (not third-party *code* execution, but 100% attacker-supplied
  repo content lands on disk). Network: unrestricted — lockdown hasn't run
  yet, default iptables policy is whatever the base image ships (ACCEPT).
- `build` step runs `BUILD_COMMAND` — **this is the manifest author's
  arbitrary string** (e.g. `pip install -r requirements.txt`, `npm install`),
  the exact place `setup.py`/npm `postinstall` hooks execute. This is real
  arbitrary code execution, and it runs with **full, unrestricted network** —
  lockdown has not happened yet. Your Phase 1 concern here is correct and
  confirmed by the code.
- `run` step runs `RUN_COMMAND` — also arbitrary, also real code execution —
  but it runs **after** `lock_down_network()`, so it gets the restricted
  DNS+80+443 egress described in §3.

### 2. Root vs. `sandbox` user — correction to the plan's assumption

Phase 1 item 1 says "right now they appear to run before the lockdown, with
full network" and separately asks to "move the build to run as the
unprivileged `sandbox` user." The network-timing half is correct (see above).
**The user half is not** — the build already runs as `sandbox`, not root.
From `run_step()`, used for *both* build and run:

```python
proc = await asyncio.create_subprocess_exec(
    "su", "-s", "/bin/bash", SANDBOX_USER, "-c", command,
    cwd=WORKDIR, ...
)
```

What *does* run as root: `supervisor.py`'s own process (per
`Dockerfile.sandbox`'s comment, root is kept for the iptables `NET_ADMIN`
call), and — this is not something the plan mentioned —
**`clone_repo()`'s `git clone` call itself runs as root**, not `sandbox`:

```python
async def clone_repo() -> int:
    ...
    proc = await asyncio.create_subprocess_exec(
        "git", "clone", "--depth", "1", "--branch", SOURCE_REF, REPO_URL, WORKDIR,
        ...
    )
    ...
    if code == 0:
        subprocess.run(["chown", "-R", f"{SANDBOX_USER}:{SANDBOX_USER}", WORKDIR], check=False)
```

Ownership is only handed to `sandbox` *after* a successful clone. The clone
itself — parsing an attacker-controlled remote's response, running whatever
your installed `git` version does with `--depth 1` — happens as root. I'm
not aware of a live exploit for this specifically, but it's root running
against attacker-influenced input, which is the category of thing this
whole design otherwise avoids everywhere else. Worth a line item even though
you didn't ask for it.

### 3. After lockdown: allowlisted or blocked? What's on it, where defined?

Allowlisted, not fully blocked — and I changed this within this session in
response to a real bug report (an agent's own `urllib` call failing DNS
resolution), so it's worth being precise about exactly what's open now.
`lock_down_network()`, in full:

```python
subprocess.run(["iptables", "-P", "OUTPUT", "DROP"], check=False)
subprocess.run(["iptables", "-A", "OUTPUT", "-o", "lo", "-j", "ACCEPT"], check=False)
if ingest_ip:
    subprocess.run(["iptables", "-A", "OUTPUT", "-d", ingest_ip, "-p", "tcp", "--dport", "443", "-j", "ACCEPT"], check=False)
subprocess.run(["iptables", "-A", "OUTPUT", "-p", "udp", "--dport", "53", "-j", "ACCEPT"], check=False)
subprocess.run(["iptables", "-A", "OUTPUT", "-p", "tcp", "--dport", "53", "-j", "ACCEPT"], check=False)
subprocess.run(["iptables", "-A", "OUTPUT", "-p", "tcp", "--dport", "80", "-j", "ACCEPT"], check=False)
subprocess.run(["iptables", "-A", "OUTPUT", "-p", "tcp", "--dport", "443", "-j", "ACCEPT"], check=False)
```

Default policy DROP, then ACCEPT: loopback; the ingest host specifically on
443 (now redundant — see below); DNS (UDP+TCP/53) to **any** destination;
HTTP (80) to **any** destination; HTTPS (443) to **any** destination.

Two things worth flagging precisely:

- The allowlist is **by port/protocol only, not by destination host** (the
  one host-scoped rule, for the ingest endpoint, is now functionally dead —
  the general port-443 ACCEPT rule below it already matches that same
  traffic). This is exactly what Phase 1 item 3 wants changed
  ("data-driven rather than hardcoded"), and it's a real gap: any agent can
  reach any host on 80/443/53, not just an approved set.
- There is **no logging** of allowed or blocked egress anywhere — no
  `-j LOG` rule, nothing written to the ingest log about connection
  attempts. Phase 1 item 3's "log every allowed and blocked egress attempt"
  is not a refinement of something partial, it's building this from zero.
- The **build step has no allowlist at all** — it runs before
  `lock_down_network()` executes, full stop. Phase 1 item 1's "apply an
  egress allowlist (package registries + github.com only) BEFORE the build"
  is proposing something that doesn't exist yet in any form, not narrowing
  something already scoped.

### 4. Limits besides 512MB / 1 shared CPU — partial correction

- **Wall-clock deadline: already exists inside the supervisor**, contrary to
  the plan's framing ("the reaper is a backstop, not a timeout" — true of
  the reaper, but there's also an in-process timeout already). `run_step()`:
  `await asyncio.wait_for(_pump_output(proc), timeout=timeout_seconds)`,
  with `proc.kill()` on `asyncio.TimeoutError`. This applies to both the
  build (`BUILD_TIMEOUT_SECONDS = 120`, hardcoded) and the run
  (`MAX_RUN_SECONDS`, from `settings.SANDBOX_MAX_RUN_SECONDS`, default 180).
  There's a *third* layer beyond that: `fly_machines.create_machine()` sets
  `"kill_timeout": max_run_seconds + 30` on the Fly Machine itself — Fly
  force-kills the machine independent of the supervisor's own logic. So
  timeouts are already three-deep: supervisor `wait_for` → Fly
  `kill_timeout` → `reap_stale_runs()` DB-TTL backstop. This axis is in
  better shape than the plan assumes.
- **Log byte cap: already exists, in two places.** Client-side in
  `supervisor.py`'s `send()` (stops accumulating past `MAX_LOG_BYTES`, though
  it keeps POSTing empty chunks after the cap rather than stopping
  entirely — minor, not a real bug) and independently, server-side, in
  `sandbox_runner.append_logs()` (`remaining = max(settings.SANDBOX_MAX_LOG_BYTES
  - row["log_bytes"], 0)`, truncates before writing to the DB). Defense in
  depth already. Phase 2's "log byte cap truncates instead of streaming
  unbounded" is testing existing behavior, not a fix.
- **Disk quota: does not exist.** No `--storage-opt`, no cgroup disk limit,
  nothing in `Dockerfile.sandbox` or the machine's `guest` config in
  `fly_machines.py`. A build or run step can fill the machine's disk; the
  only backstop is that the whole machine is ephemeral and capped by
  whatever Fly's default root volume size is for this guest spec — I have
  not verified that default number.
- **Process/fd cap: does not exist.** No `ulimit` set anywhere for `-u`
  (max processes) or `-n` (max fds). A forkbomb in the build or run command
  is bounded only by whatever the kernel's own defaults are inside the
  Firecracker VM — not something this code sets deliberately.

### 5. Termination in each scenario

- **Success**: run step exits 0 → `send(status="succeeded", exit_code=0)` →
  `main()` returns → process exits 0 → Fly's `auto_destroy: true` +
  `restart.policy: "no"` tears the machine down.
- **Agent hangs**: `asyncio.wait_for` times out → `proc.kill()` → `send`
  reports `status="timeout"` → clean exit, same teardown as above. This is
  a real, working path today, contrary to what "the reaper is a backstop,
  not a timeout" might suggest about hangs specifically — hangs are already
  caught in-process.
- **Agent OOMs**: **not independently verified — inferred from code only.**
  Nothing in `supervisor.py` sets memory limits or watches for OOM
  specifically. If the kernel OOM-kills the agent's own subprocess,
  `proc.wait()` returns a signal-based exit code and it's reported as
  `"failed"` with that code — plausible, not tested. The worse case — the
  OOM killer targets `supervisor.py`'s own process instead, since everything
  shares the one 512MB VM — would mean no ingest call ever fires, and the
  run sits until `fly_machines`' `kill_timeout` or `reap_stale_runs()`'s
  300s TTL catches it. I have not run an OOM scenario against a live
  machine (out of scope for Phase 0 per your instruction not to touch live
  Fly apps) — this is exactly the kind of thing Phase 2 should test for
  real rather than take on my word.
- **Supervisor crashes** (uncaught exception in `main()`): no try/except
  wraps it; Python prints a traceback and exits non-zero. The DB row is
  never updated to a terminal state by the machine itself.
  `reap_stale_runs()`'s own docstring names this exact case — "crash, lost
  network, killed before it could call the ingest endpoint" — and it's the
  designed backstop: the row sits active until `SANDBOX_RUN_TTL_SECONDS`
  (300s) passes, then gets marked `timeout` and its machine force-destroyed.
  Confirmed by reading both sides, not assumed.
- **Fly API call fails mid-create**: cleanly handled —
  `sandbox_runner.start_run()` wraps `fly_machines.create_machine()` in
  try/except, marks the row `failed` immediately, raises a 503. One gap I
  found that isn't in your list: if `create_machine()` *succeeds* (machine
  is now live and billing) but the **subsequent** `UPDATE agent_sandbox_runs
  SET fly_machine_id = $1` fails (e.g. a dropped DB connection right after),
  there's no try/except around that specific statement. The run still
  completes normally via its own ingest calls, but `stop_run()` and
  `reap_stale_runs()` can't force-kill that machine early since they both
  gate on `row["fly_machine_id"]` being set. It would still self-terminate
  via its own internal timeout eventually, so this is a "can't cancel early"
  gap, not an unbounded leak — but it is a gap.

### 6. Secrets reaching the sandbox machine

Full trace of `env` in `sandbox_runner.start_run()`:

```python
env = {
    "REPO_URL": _repo_url(agent), "SOURCE_REF": ..., "BUILD_COMMAND": ...,
    "RUN_COMMAND": ..., "RUNTIME": ..., "RUN_ID": str(run_id),
    "MAX_RUN_SECONDS": ..., "MAX_LOG_BYTES": ...,
    "INGEST_URL": f"{settings.SANDBOX_INGEST_BASE_URL}/internal/sandbox/runs/{run_id}/logs",
    "INGEST_TOKEN": ingest_token,
}
```

`ingest_token = secrets.token_urlsafe(32)`, generated fresh per run, checked
via `secrets.compare_digest()` against the DB row. **No platform secret —
`DATABASE_URL`, `FLY_API_TOKEN`, `JWT_SECRET`, `GITHUB_TOKEN`,
`ANTHROPIC_API_KEY`, `SMTP_PASSWORD`, `ALCHEMY_API_KEY`, or anything else in
`app/config.py`'s `Settings`** — is passed to the machine. The one token
present is scoped to exactly one thing: POST log chunks/status for its own
`run_id`. If exfiltrated, the blast radius is "can spam its own log or
prematurely flip its own run's displayed status" — not a real security
issue.

**Not independently verified**: whether any secret is set at the Fly *app*
level for `tracent-sandbox` (e.g. via `fly secrets set --app
tracent-sandbox`, which `fly.sandbox.toml`'s own comment says is a one-time
setup step "if anything" needs it). `Dockerfile.sandbox` references no
secret, and nothing in the code reads one, but I did not run `fly secrets
list -a tracent-sandbox` to confirm zero are actually configured, because
you told me not to run anything against the live Fly apps in Phase 0. This
is read-only and lists names, not values — worth doing before Phase 1
lands, just not something I did unprompted.

---

## 2. Proposed ordering, and what I'd change about the plan as written

Assuming decision §0.1 resolves toward "work on `main`, write (A)'s tests
and docs from scratch" (my default recommendation, since (A) is what's
actually live and (B)/(C) reconciliation is a separate, larger decision):

1. **Resolve §0.1 and §0.2 first.** Everything downstream depends on which
   codebase we're hardening and whether self-serve admission is still the
   intended model.
2. **Phase 1, item 1 (build-phase hardening), reordered by what's actually
   missing**: the user-drop half is already done; what's left is (a) an
   egress allowlist during build (currently: none at all, not "too wide" —
   truly nonexistent), (b) `--ignore-scripts` for npm specifically (build
   commands come verbatim from each agent's manifest today — this needs to
   be injected/enforced by the supervisor, not left to the manifest author
   to opt into), (c) moving `clone_repo()`'s `git clone` to run as `sandbox`
   instead of root, which your plan didn't ask for but I'd fold into the
   same commit since it's the same class of fix.
3. **Phase 1, item 3 (egress logging + data-driven allowlist)** before item
   2 (resource limits) — logging blocked/allowed egress is cheap, high
   signal, and the fact that it doesn't exist at all right now means every
   day without it is a day of unlogged sandbox network activity. Resource
   limits (disk/process caps) are real gaps but lower urgency than "we can't
   currently tell what a sandboxed agent talked to."
4. **Phase 1, item 2 (disk quota, process/fd cap)** — the wall-clock and log
   caps you asked for already exist; what's actually missing here is
   narrower than the plan implies. Disk and process caps are the real work.
5. **Phase 2 (tests)**, written against whatever Phase 1 lands as, since
   there's nothing to test yet and I'd rather write tests against the
   hardened build than write them twice.
6. **Phase 3 (measurement)** — genuinely independent of 1/2, could run in
   parallel any time; I have not run it, per Phase 0 scope. Flagging now
   that "what fraction of listed agents is sandboxable via path (B)" is a
   question about a component that doesn't exist on `main` — if we're not
   merging `deslop`, this number may not be the one that decides anything
   for the (A)-based sandbox mode. Worth confirming which sandbox mode this
   measurement is actually meant to inform before I run it.
7. **Phase 4 (naming)** — also blocked on §0.1. If we're staying on `main`,
   there's only (A) and (C)-the-real-`/sandbox`-listing-page to disambiguate
   (no HF-iframe mock exists here to relabel). If `deslop` merges, all three
   need labeling as you described.

**Out-of-scope analyses (secrets/BYO-key, cold-start latency)**: scoped but
not written up yet — I held off writing the full tradeoff analysis for both
until you've seen §0's branch situation, in case it changes the framing (e.g.
BYO-key policy might differ meaningfully between the self-serve model on
`main` and the curated-cohort model `deslop`'s doc proposes). Say the word
and I'll write both regardless of which way §0.1 goes, since they're
analysis-only either way.

---

## 3. Confidence

High confidence, read directly and quoted: §1.1–1.3, §1.6 (env/secrets),
the branch-state findings in §0.
Medium confidence, code-derived but not empirically tested: §1.4 (disk/fd
caps — absence confirmed by reading, but I haven't tried to actually exhaust
either), §1.5 OOM and crash paths (crash path has a matching docstring
confirming intent; OOM path is inferred, not observed).
Not verified at all: whether any secret is configured at the Fly app level
for `tracent-sandbox` (§1.6), and the actual default disk size for this
guest spec (§1.4) — both read-only checks I avoided per the "don't touch
live Fly apps" instruction, not things I checked and found clean.

Waiting on §0.1 before touching anything.
