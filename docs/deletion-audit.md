# Deletion Audit — Phase 0

Scope: the `deslop` branch checkout at `C:\Users\swann\orca\workspaces\Tracent\deslop-sandboxv2`,
HEAD = `d24c8d8` at the time of this audit. **No deletions in this document — audit only.**

## Read this first: the repo has diverged into several parallel branches

While tracing item 3 and item 1, I found that this repo currently has at least four
local branches with materially different states of the same code, not one linear history:

- `deslop` (this checkout) — the Genticspace rename saga, Sandbox Mode v1 (HF Space
  iframe embed), the Sandbox v2 mock cockpit, today's shadow fix.
- `main` — diverged *before* the Genticspace rename saga started. Still names everything
  `tracent_id`/`tracent` internally with **no rename or revert migration code at all**
  (verified: `grep -n "genticspace" app/db/database.py` in the `main` worktree at
  `C:\Users\swann\OneDrive\Tracent` returns nothing). It separately grew its own
  Fly-Machines-based Sandbox Mode (`72142b2`) with its own schema additions
  (`job_runs`, `agent_sandbox_config`, `agent_sandbox_runs`) and its own `.gitignore`
  `*.zip` rule.
- `Auth-Account-Security` — has already merged `origin/main` (`49c3cbf`) and independently
  did its own dead-UI/zip cleanup (`815a3a4 "Remove dead UI: old landing components,
  orphaned assets, stray design zips"`) and an auth hardening pass (`e0ae176`), none of
  which `deslop` has.
- `Sandbox` — a third, unrelated Docker-container-based sandbox prototype, never pushed
  anywhere, based directly on `main`.

**Why this matters for this audit:** production (`tracent-registry` on Fly) has, over the
last few days, actually been deployed from *both* `main` and `deslop` at different times
(confirmed via `fly releases --json` timestamps cross-referenced with commit timestamps).
The live database has been shaped by migration code from both lineages. Items 2 and 3
below are traced precisely for what **this checkout's code** does; where that differs from
what's *currently actually running in production*, I've called it out explicitly. I'd
recommend reconciling these branches before relying on any single one as "the" source of
truth — that's a separate, larger conversation than this audit.

---

## Category definitions used below

- **SAFE** — provably unreferenced, delete freely
- **NEEDS-DECISION** — works fine, whether we want it is a product call
- **DANGEROUS** — deleting it could break a live deploy or a production DB
- **KEEP** — looks like cruft, isn't

---

## SAFE

### S1. The two "Shared design link (\*).zip" archives — already gone, nothing to delete

**There is nothing to delete here.** On this branch, both zips were already removed —
as an *undocumented side effect* of commit `1508e92` ("Revert backend identifiers from
genticspace_id/genticspace back to tracent_id/tracent"), whose diff includes:

```
 Shared design link (1).zip | Bin 73763 -> 0 bytes
 Shared design link (2).zip | Bin 5208963 -> 0 bytes
```

That commit's message says nothing about deleting design assets — it's a pure bycatch of
an unrelated commit. Confirmed via `git cat-file -e HEAD:"Shared design link (1).zip"` →
absent; `git log --oneline -- "Shared design link (1).zip"` shows only the add (`8fe7f7e`,
2026-07-20, 73,763 bytes) and this incidental delete in its own-branch ancestry.

Confirmed nothing ever built from them: `git grep` for `unzip`, `.zip`, and the literal
filename across every commit reachable from `HEAD` returns zero hits outside `.gitignore`.
Contents (recovered from the historical blob for the record): zip 1 was 11 files of
`design_handoff_tracent/*.dc.html` mockups; zip 2 was 40 image assets. No credentials in
either (see Security section below).

One real gap: **this branch's `.gitignore` has no `*.zip` rule** — that rule exists on
`main` (added in `72142b2`) but `main` and `deslop` diverged before that commit, so
`deslop` never got it. Low-risk, one-line addition to prevent recurrence if you want it;
not a deletion action so I'm flagging rather than doing it.

### S2. `agents/hello-world/` + `scripts/register_hosted_agent.py` + `scripts/run_hello_world_agent.py`

Provably inert. Evidence:
- `register_hosted_agent.py`'s own docstring states there is no real hosting deployment
  yet; it defaults `--mcp-endpoint`/`--web-endpoint` to `http://127.0.0.1:8090`, paired
  with `run_hello_world_agent.py` (a local simulation runner only).
- `agents/hello-world/` has its own standalone `Dockerfile` with no `fly.toml` — the
  root `fly.toml`/`Dockerfile` only build `app/`. Nothing in `.github/` builds or pushes it.
- Full-repo grep for `hello-world|hello_world|register_hosted_agent` hits only these
  files plus two docs (`docs/hosting-architecture.md`, `docs/sandbox-execution-architecture.md`)
  that reference it narratively as a design spike, not as a live path.
- **Schema drift makes it doubly dead**: the spike writes `trust_tier`/`source =
  'genticspace-hosted'`, but `app/db/database.py`'s revert migration converts that value
  to `'tracent-hosted'` on every boot. Nothing in `app/services/indexer.py` or elsewhere
  ever produces either value today — `app/services/trust_summary.py`'s
  `trust_tier == "tracent-hosted"` branch is itself unreachable dead code fed by nothing.
  Even a manual run of `register_hosted_agent.py` today would write a value the rest of
  the app no longer recognizes.
- Not referenced by README's actual documented steps (README only cites the *doc*, not
  the scripts).

Recommend deleting all three, one commit. Note: this leaves `trust_summary.py`'s
`"tracent-hosted"` branch as a small separate piece of dead code — didn't touch it since
it wasn't explicitly asked about; flagging in the "found but out of scope" list below.

### S3. `web3` and `requests` in `requirements.txt`

Independently verified myself (not just taking the sub-agent's word for it):

```
$ grep -rn "web3\|Web3" app/ tests/ scripts/ --include="*.py"
app/services/github_analysis.py:17:    "web3": ["web3", "ethers"],   # a string in a keyword-detection list, not an import
$ grep -rn "^import requests\|^from requests" app/ tests/ scripts/ --include="*.py"
(no output)
```

All on-chain calls in `app/services/indexer.py` use raw JSON-RPC via `httpx`, never the
`web3` package. Zero references to `requests` anywhere. Both are pure `pip install`
weight — safe to drop from `requirements.txt`. (Every other line in `requirements.txt`
and `requirements-dev.txt`, and every dependency in `frontend/package.json`, resolved to
a real usage or a build-tool config file — see the KEEP section.)

### S4. CapabilityShowcase / HeroSearchDemo / FilterSidebar / BuilderFeature — already gone, nothing to delete

Same situation as S1: the claim in `46ce62d`'s commit message checks out completely.

- `git ls-files | grep -iE "CapabilityShowcase|HeroSearchDemo|FilterSidebar|BuilderFeature"` → no output (not tracked).
- No orphaned untracked files on disk with those names either.
- Zero remaining references to any of the four identifiers anywhere in `frontend/**/*.{ts,tsx}`.
- No leftover dark-navy-theme styling found anywhere in `frontend/app` or
  `frontend/components` (searched for `navy`, dark hex prefixes, "old design"/"v1
  design"/"reference bundle" — one unrelated hit, a UI copy string about "on-chain
  identity reference" in `ListingForm.tsx`, nothing to do with the design bundle).

Nothing to delete; recorded here so Phase 1 doesn't waste a commit "removing" files that
don't exist.

---

## NEEDS-DECISION

### N1. Legacy `/agents` + `/trust` (API-key) vs `/public/agents*` (JWT/no-key)

Full map (frontend calls, README, tests) — I'm not recommending an action, per your
instruction that this is your call:

| Surface | Path(s) | Auth | Called by frontend? | In README? | Tested? |
|---|---|---|---|---|---|
| Legacy (`app/routes/agents.py`, prefix `/agents`) | `GET /agents`, `/agents/{id}`, `/agents/source/{source}/{source_id}`, `/agents/flagged`, `/agents/categories` | `X-API-Key` (router-level `Depends(verify_api_key)`) | No | Yes — README.md:39-71, "Agent Lookup" | Yes (`test_search_categories.py`, `test_moderation.py`, `test_auth.py`, `test_sandbox.py`, `test_regression_flagged_only.py`) |
| Legacy submit (`agents_submit_router`, same prefix) | `POST /agents/submit` | None (rate-limited 5/min) | No | No | Yes (`test_moderation.py`, `test_rate_limit.py`) |
| Legacy (`app/routes/trust.py`, prefix `/trust`) | `GET /trust/{id}`, `/trust/source/{source}/{source_id}` | `X-API-Key` | No | **Yes — README.md:73, header is literally "### Trust Lookup (primary agent-to-agent route)"** | Partial (`test_auth.py` asserts the auth gate only) |
| New (`app/routes/public.py`, prefix `/public`) | `/public/agents*`, `/public/my-agents`, `/public/top-providers`, `/public/recommendations`, etc. | JWT (`get_current_user`/`get_current_user_optional`) | **Yes — every frontend call goes through `frontend/lib/api.ts`'s `request()`, exclusively `/public/*` paths** (lines 62, 66, 81, 92, 104, 117, 165, 174, 186) | Not mentioned at all | Yes, same test files as above, run in parallel against both surfaces |

Also found: `docs/testing.md:80-100` explicitly documents that both surfaces are tested in
parallel to keep them provably equivalent, and `docs/hosting-architecture.md:283-284`
frames `/agents/{id}` vs `/public/agents/{id}` as the same "other agent" story on two
doors. `frontend/lib/trust.ts:97-98` only *mentions* `/trust` in a comment describing a
response shape — it doesn't call it.

Small additional finding: the README's own example `/trust/{id}` JSON response
(README.md:88) still shows `"genticspace_id": "trc_..."` as the field name — that's
stale; the live API returns `"tracent_id"` today (verified against
`https://tracent-registry.fly.dev/public/agents`). Doc-drift, not a deletion candidate,
but worth a fix whenever this section gets touched.

**The call to make:** the legacy surface is unused by your own frontend but is your only
currently-documented, currently-tested, key-gated "agent-to-agent" contract. Nothing
found suggests an external consumer, but nothing found rules one out either — an API key
gate means external callers wouldn't show up in your logs' referrer/origin the way a
public endpoint's would, and I have no access to your access logs to check for that.

### N2. `reset_index.py` — undocumented and can be run against production by accident

Not referenced anywhere: `git grep -in "reset_index"` across every commit and the
current tree hits only the script itself — no README, no docs, no CI step, no onboarding
note.

What it actually does: connects to whatever `settings.DATABASE_URL` resolves to (i.e.
whatever's in the environment it's run in — nothing in the script itself distinguishes
dev from prod) and unconditionally runs `DELETE FROM index_state`, no confirmation
prompt, no dry-run flag, no "are you sure."

What that causes on next boot, traced through `app/services/indexer.py`: `index_state`
holds `last_indexed_block` per chain. With it wiped, `ingest_agents()` falls back to
`cfg.start_block` (or a fresh binary search for the contract's deployment block) and
indexes from there forward again. `agents`/`transfer_events` use `ON CONFLICT DO
NOTHING`, so **no data corruption or duplication results** — but `_process_token`
unconditionally re-runs an `eth_call` (`_get_token_uri`) and an HTTP metadata fetch for
every single previously-indexed token on the full rescan, with no "already fully
indexed, skip" short-circuit. Against the real chain history, that's a large,
uncontrolled burst of Alchemy RPC calls and metadata fetches — real cost and real
rate-limit risk, on a machine already tight enough on memory that a startup burst of
scrapers previously OOM-killed it (see `app/main.py`'s lifespan comment).

This isn't dead code — it's presumably still a legitimate "force a reindex" dev tool —
but as shipped it's a footgun with no safety rail and no paper trail. Your call on which
of these: (a) keep it, but add an explicit environment guard/confirmation prompt and a
line in README/docs pointing at it, (b) keep it undocumented on the assumption only
people who already know what it does will find it, or (c) delete it if a manual full
reindex is no longer a workflow anyone actually uses now that indexing runs continuously
on a schedule. I did not modify it.

---

## DANGEROUS

### D1. The Genticspace ↔ Tracent rename/revert migration in `app/db/database.py`

**Analysis only, as instructed — no edits.**

Current state of the file (this branch): there is exactly **one** migration function,
`_migrate_genticspace_to_tracent`, and it runs once, before `_SCHEMA`, on every boot. The
forward function (`tracent_id → genticspace_id`, added in `e362746`) no longer exists
anywhere in the codebase — it was deleted, not merely superseded, when `1508e92` added
the revert. **There is no ping-pong**: only one direction of this migration is coded, and
it's guarded to become a permanent no-op the moment it succeeds once (checks
`information_schema.columns` for `genticspace_id` before doing anything; if that column
isn't there, every `DO $$ ... IF EXISTS ... END $$` block is a no-op).

Tracing all three states you asked for:

**(a) Fresh database.** `agents` doesn't exist yet when the migration function runs
(before `_SCHEMA`'s `CREATE TABLE`). `agents_table_existed` evaluates false;
every guarded block inside `_RENAME_GENTICSPACE_TO_TRACENT` is a no-op (its `IF EXISTS`
checks find no matching table/column); the post-check `if agents_table_existed and not
renamed` is false, so no error. `_SCHEMA` then creates every table with `tracent_id`
directly. Clean. (This is the exact scenario `023b6e5` fixed — before that commit, the
`UPDATE agents SET ...` lines ran unconditionally and threw `UndefinedTableError` on
every fresh DB / test run, since they weren't guarded the same way the rename itself
was.)

**(b) The database this code assumes it's talking to** (i.e., one that has
`genticspace_id` right now, from the forward migration having run and not yet been
reverted). The rename block's `IF EXISTS` finds `genticspace_id`, renames all 8 tables'
columns back to `tracent_id`, and the paired `UPDATE` reverts `trust_tier`/`source`
values (`genticspace`→`tracent`, `genticspace-hosted`→`tracent-hosted`). Post-check finds
`tracent_id` present, no error, logs success. From the *next* boot onward the guard is
permanently false — clean, idempotent, one-time-effective.

**(c) The actual current production database, empirically checked, not assumed.** I
queried the live API rather than guessing: `curl https://tracent-registry.fly.dev/public/agents?page_size=1`
returns records keyed `"tracent_id"` (not `"genticspace_id"`) as of today. **Production is
already in the fully-reverted, target state** — this migration is already a confirmed
no-op there right now.

**The complication worth surfacing:** `tracent-registry` in production was redeployed
*today*, by me, earlier in this session, from the `main` branch — which, as noted at the
top of this doc, contains **neither** the forward nor the revert migration function at
all (`main` predates the whole rename saga). `main`'s `_SCHEMA` just runs its
`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ADD COLUMN IF NOT EXISTS` statements
unconditionally against the existing `tracent_id`-named tables — which is safe *only
because* the DB already happened to be in that state by the time `main` was deployed
against it. Cross-referencing `fly releases --json` timestamps against commit
timestamps, the forward rename (`e362746`, committed 2026-07-22 19:14 UTC) and the revert
(`1508e92`/`023b6e5`, committed 2026-07-23 06:03-06:06 UTC) bracket Fly releases v25-v29
(2026-07-23 00:44-02:22 UTC) — meaning production likely *was* physically in the
`genticspace_id` state for a few hours that day, before whatever deployed next (v30,
2026-07-24 22:24 UTC) carried the revert and fixed it. I can't produce a perfect
commit-to-deploy mapping from timestamps alone, but the live-API check above confirms
where things actually landed, which matters more than reconstructing the path.

**Recommendation (not an action — you asked to approve before touching this):** leave
`_migrate_genticspace_to_tracent` exactly as-is. It already meets your Phase 2 preference
— a guarded no-op with a comment explaining why it exists — and deleting it would remove
the one thing that would auto-heal the DB if it ever drifted back to `genticspace_id`
(e.g. if `deslop`'s backend, rather than `main`'s, gets deployed again later and the DB
happens to be in a mixed state). The only thing I'd flag as worth *your* decision, not
mine: whether `main`'s database.py should also carry this guard, given it's now also
being deployed against the same production DB and currently has zero protection if the
naming ever drifts.

---

## KEEP

### K1. All ~17 APScheduler jobs registered in `app/main.py` — not dead, contrary to the premise

I checked every `backfill_*` function (the ones that sound like one-shot migrations) and
none of them are unconditional re-runs. Each is gated on a real completion sentinel and
returns cheaply once caught up:

| Job | Interval | Guard | What a re-run costs once caught up |
|---|---|---|---|
| `backfill_connects` | 6h | `WHERE github_url IS NULL AND web_endpoint IS NOT NULL` (+ same for hf) | One `UPDATE ... WHERE` touching 0 rows |
| `backfill_erc8004` | 6h | `WHERE source='erc8004' AND (description IS NULL OR trim='')` | One `UPDATE ... WHERE` touching 0 rows |
| `backfill_github` | `GITHUB_ENRICH_INTERVAL_HOURS` (24h) | `WHERE source='github' AND github_enriched_at IS NULL LIMIT batch` | One indexed `SELECT ... LIMIT`, returns empty, logs "nothing to backfill", exits |
| `backfill_huggingface` | `HF_ENRICH_INTERVAL_HOURS` (12h) | same pattern, `hf_enriched_at IS NULL` | same — cheap no-op |
| `backfill_npm` | `NPM_ENRICH_INTERVAL_HOURS` (24h) | same pattern, `npm_enriched_at IS NULL` | same |
| `backfill_futurepedia` | `FUTUREPEDIA_ENRICH_INTERVAL_HOURS` (24h) | same pattern, `futurepedia_enriched_at IS NULL` | same |

These aren't one-time backfills that finished and now spin uselessly — they're a
continuous queue: the paired `scrape_*` jobs (github/huggingface/npm/futurepedia,
12-24h intervals) keep discovering new, not-yet-enriched agents, so there's always a
legitimate (if usually small) trickle of new rows for the backfills to pick up. Same
guard pattern confirmed in `readme_scraper.py` (`readme_fetched_at IS NULL OR <stale by
$1 days>` — also a legitimate periodic refresh, not just an initial pass).

The remaining jobs (`index_{chain}` every `INDEX_INTERVAL_MINUTES`=10min,
`check_endpoints` every 30min, `ard_crawler`/`scrape_huggingface`/`scrape_github`/
`scrape_npm`/`scrape_futurepedia`/`scrape_ycombinator`/profile scrapers, 12-24h) are
ongoing discovery jobs by design — new on-chain agents, new repos, new domains, new YC
companies keep appearing over time, so there's no "this already finished" state for them
to reach. None of these 17 jobs are dead weight; I'm not recommending removing any of
them. (Separately, whether `backfill_erc8004`'s 6h interval is tighter than it needs to
be, given ERC-8004 registrations are presumably slow-growing, is a tuning question, not a
deletion one — flagging only, not deciding.)

### K2. `frontend/package.json` — every dependency in active use

`next`/`react`/`react-dom` (imported across the app), `eslint`+`eslint-config-next`
(`eslint.config.mjs`), `tailwindcss`+`@tailwindcss/postcss` (`globals.css`'s
`@import "tailwindcss"` + `postcss.config.mjs`), `typescript`+`@types/*`
(`tsconfig.json`). Nothing to remove.

### K3. `requirements.txt` / `requirements-dev.txt` — everything except S3 is in active use

`fastapi`/`uvicorn` (app/main.py + every route file), `asyncpg` (database.py),
`httpx` (15 scraper files), `apscheduler` (main.py), `pydantic-settings` (config.py),
`python-dotenv` (npm_scraper.py), `bcrypt`/`pyjwt` (auth.py/jwt_auth.py),
`email-validator` (Pydantic `EmailStr` fields), `anthropic` (sandbox_guide.py and the
description backfill), `slowapi` (rate_limit.py/main.py), `pytest`/`pytest-asyncio`
(tests/). Only `web3` and `requests` (S3) showed zero usage.

---

## Security — item 9, git history secrets scan

**No secrets found.** Full detail:

- No `.env` file was ever committed, at any point in history, on any branch reachable
  from this repo. `.env` has been in `.gitignore` since the very first commit
  (`88267ee`) — there's no window where it could have been tracked and later ignored.
  The only committed env-shaped file is `.env.example` (`b631994`), containing only
  placeholders and a public contract address.
- `app/config.py`'s full 11-commit history: every secret-shaped setting
  (`ALCHEMY_API_KEY`, `DATABASE_URL`, `API_KEY`, `JWT_SECRET`, `ANTHROPIC_API_KEY`,
  `GITHUB_TOKEN`, `HUGGINGFACE_TOKEN`, `FLY_API_TOKEN`) is declared `| None = None`,
  read from environment only, in every version.
- Pattern search across every commit for AWS-style keys, Anthropic keys (`sk-ant-`),
  GitHub tokens (`ghp_`/`github_pat_`), Hugging Face tokens (`hf_`), PEM private key
  blocks, and `postgres://` URLs with an embedded password: zero real hits. The only
  `hf_`/`FLY_API_TOKEN` matches were code (ID-prefix generators, env-var name
  references), not literal values.
- The two now-deleted zip archives (see S1) were extracted from their historical git
  blobs and their contents listed — 11 design-mockup HTML files in one, 40 image assets
  in the other. No `.env`, `.pem`, or credential-shaped filenames in either.

Nothing to rotate, nothing to flag loudly. No history rewrite needed or attempted.

---

## Found but out of scope — didn't touch, flagging for awareness

- **The branch divergence itself** (see top of doc). Reconciling `deslop`/`main`/
  `Auth-Account-Security`/`Sandbox` is a much bigger decision than this audit and
  affects how much you can trust any single branch's view of "current" state, including
  parts of this document.
- **`app/services/trust_summary.py`'s `trust_tier == "tracent-hosted"` branch** — dead
  code fed by nothing now that the hosted-agent spike (S2) never produces that value.
  Small, harmless, not part of what was asked.
- **README.md:88** — the documented `/trust/{id}` example response still shows the field
  name `genticspace_id`; live API returns `tracent_id`. Doc-drift, not a deletion
  candidate.
- **`main`'s `database.py` has no migration guard at all** for the tracent/genticspace
  naming, unlike `deslop`'s — see D1's last paragraph. Only matters if `main` and
  `deslop` ever get deployed against the same DB in an order that matters.
- **Interval tuning on `backfill_erc8004`** (6h) — noted in K1, not a deletion question.

---

## What I'd suggest for Phase 1, pending your approval

In dependency order, each its own commit, tests run after each:

1. Remove `web3` and `requests` from `requirements.txt` (S3).
2. Delete `agents/hello-world/`, `scripts/register_hosted_agent.py`,
   `scripts/run_hello_world_agent.py` (S2).

Nothing else in SAFE requires a deletion commit (S1 and S4 are already-clean states, not
pending actions). Everything else in this document (N1, N2, D1) is waiting on your call,
per the rules of engagement.
