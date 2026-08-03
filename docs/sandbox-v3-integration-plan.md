# Sandbox v3: full integration plan

Goal: make the `Sandbox v3.dc.html` design (conversation + trace waterfall +
permissions panel + scorecard, in a Notion-doc layout) the real interface for
trying an agent in the sandbox, backed by real data end to end — not a mock.

This doc is written to be handed to an implementation session as a work
order. It's phased because the four pieces (conversation, trace, permissions,
scorecard) have very different amounts of real foundation to build on today —
verified by reading `app/services/managed_agents.py` and
`app/services/sandbox_runner.py`, not assumed.

## What already exists (verified, not guessed)

- A sandbox run is a Managed Agents *session* (`managed_agents.start_ai_run`).
  Its event stream (`client.beta.sessions.events.list(session_id)`) already
  contains structured events: `agent.message` (text), `agent.tool_use` (a real
  tool `name` + `input`, e.g. `bash` + a command), `agent.tool_result` (real
  output text), plus thread-status events that signal idle/terminated.
- Today, `managed_agents._event_to_log_line()` immediately **flattens every
  one of those events into a single plain-text log line** and
  `managed_agents.sync_run()` joins them into one `logs` string, which
  `sandbox_runner.get_run()` (around line 215-241) merges into the
  `agent_sandbox_runs` row. The structure is thrown away at the very first
  step — nothing downstream ever sees it. This is the main lever: most of
  "add a real trace" is *stop discarding data we already have*, not new
  infrastructure.
- `agent_sandbox_runs` has real per-run `status`, `exit_code`, `logs`,
  `created_at`/`started_at`/`finished_at`, `execution_lane`, `session_id`.
- `sessions.create()` takes `initial_events` (the opening `user.message`).
  Nothing in the codebase currently sends a *second* message into an existing
  session — `managed_agents.py`'s own header comment says the one-shot
  install-and-report task is "not a conversation" **by choice, not by
  platform limitation**. Whether the SDK exposes an
  `events.create()`/equivalent to append a `user.message` to a live session
  needs to be confirmed against the Managed Agents SDK reference before
  committing to real-time multi-turn — flagged as the one open technical
  question in Phase 1 below.

## What has zero foundation

- **Scorecard against "saved examples."** No concept of a golden test case,
  no grading/comparison logic, no storage for either. This is a real product
  feature to design, not a wiring task — see Phase 4.
- Everything else in the mock (run-limit countdown like "18/50", "expires in
  6 days", per-agent cost) is either derivable from real fields once the
  product decides the actual limits (see Phase 0) or is out of scope until
  billing exists at all (cost — not attempted here).

---

## Phase 0 — Product decisions needed before writing code

These aren't engineering questions; flag them back to whoever owns the
feature before Phase 1 starts:

1. **Trial limits.** The mock shows a 50-run cap and a 6-day expiry per
   trial. Neither exists today (`SANDBOX_DAILY_RUNS_PER_USER` is a global
   per-user rate limit, not a per-agent trial budget). Decide the real
   numbers, or drop the countdown/limit UI if trials are meant to be
   unlimited for now.
2. **Permission labels.** The mock's permissions list is domain-specific
   fiction ("Read order records", "Send email / issue refunds") because it's
   a fake refund-agent demo. A real agent's session only ever exposes generic
   execution capabilities — `bash`, package installation, GitHub repo
   read/write, outbound network per `allowed_hosts`. Decide whether the UI
   shows these generic capabilities honestly (recommended) or whether there's
   an appetite for agents to self-declare human-readable capability
   labels (would need a new manifest field, out of scope here).
3. **Multi-turn conversation UX.** Confirm the Managed Agents SDK supports
   appending a message to a live session (see open question above) before
   promising users a real back-and-forth. If it doesn't, the honest interface
   is "one task in, one report out," which is a materially different (and
   simpler) UI than the mock's chat thread.

## Phase 1 — Real conversation (replace one-shot with an actual thread, if the SDK allows it)

1. Confirm via the Anthropic Managed Agents SDK reference whether an
   existing `session_id` can receive a new `user.message` event
   post-creation (likely `client.beta.sessions.events.create(session_id,
   ...)` or similar — check the SDK's type stubs the way
   `start_completion_run`'s own docstring already does for a different
   uncertainty).
2. If yes: add `managed_agents.send_message(session_id, text)`. Update
   `POST /public/agents/{tracent_id}/sandbox/runs` (or a new
   `POST .../sandbox/runs/{run_id}/messages` endpoint) to call it, gated on
   the run's `execution_lane == 'ai'` and status being idle/waiting, not
   finished.
3. If no: don't build a chat UI. Build a "describe your task, get one
   report" composer instead (closer to the *existing* `RunConsole.tsx`
   composer than to the mock) and say so explicitly in the PR description —
   don't silently make the UI look conversational over a backend that isn't.

## Phase 2 — Real trace (waterfall of spans with real input/output)

This is the highest-value, lowest-risk piece because the raw data already
exists in the event stream.

1. Add a `sandbox_run_events` table (or a JSONB column on
   `agent_sandbox_runs` if volume is low — decide based on expected event
   count per run) storing each raw event: `run_id`, `seq`, `type`, `name`
   (tool name, if any), `input` (JSONB), `output` (JSONB), `created_at`.
2. Change `managed_agents._collect_events` (or add a sibling function) to
   persist structured events instead of/alongside the flattened log line —
   keep `_event_to_log_line` for the legacy plain-log view (`RunConsole.tsx`
   still needs it, and the Fly-lane runs never produce structured events at
   all), but stop it being the *only* thing captured for AI-lane runs.
3. Map event types to the mock's span "kind" taxonomy honestly:
   `agent.tool_use` → `tool` (real tool name), consecutive
   `agent.message`/reasoning content → `llm`. The mock's `chain` and `hold`
   kinds are specific to its fictional multi-step refund workflow — there's
   no equivalent today; either drop those two kinds or define what a real
   `hold` means (e.g., "waiting on a user reply," which only exists once
   Phase 1 ships).
4. Duration per span: use consecutive event timestamps if the SDK's event
   objects carry them (check `event.model_dump()`'s actual keys — the current
   code only reads `type`/`content`/`name`/`input`, hasn't looked at
   timestamp fields yet). Token counts: check whether usage data is present
   per-event or only session-level; if only session-level, don't fabricate a
   per-span number — show it only at the run level.
5. New endpoint: `GET /public/sandbox/runs/{run_id}/events` returning the
   structured list, paginated/limited sensibly (a long run could have
   hundreds of tool calls).
6. Frontend: new trace-tree component matching the mock's indentation/glyph
   treatment, fed by the new endpoint instead of `hint-placeholder-count`
   fixtures.

## Phase 3 — Real permissions/capability panel

1. Derive from the same structured events as Phase 2 — no new capture
   needed, just a different view over `sandbox_run_events`: distinct
   `agent.tool_use` names used during the run, plus the environment's
   configured `networking.allowed_hosts` (already known at run-start time
   from `managed_agents.start_ai_run`'s `env` config) to show what network
   access was *available* vs. what was actually *used*.
2. Label these with the real generic capability names from Phase 0's
   decision, not the mock's fictional business actions.
3. "BLOCKED" state maps to something concrete: a capability the environment
   never grants at all (e.g. no outbound network beyond
   `allowed_hosts`) — this is knowable from the environment config, not
   fabricated.

## Phase 4 — Scorecard (the one genuinely new feature)

This needs its own design pass before implementation, not just engineering.
Rough shape once product decides:

1. A way to author "saved examples" per agent (input + what a correct
   response looks like) — who writes these: the agent's own maintainer via
   the Contribute flow, or each trying user for their own use case? Different
   data model either way.
2. A grading step: most realistically an LLM-graded comparison (a second,
   cheap model call judging the transcript against the saved example),
   run either synchronously at trial end or as a background job.
3. New tables: `sandbox_saved_examples` (per-agent or per-user, TBD by the
   product decision above) and `sandbox_scorecard_results` (per-run, per-
   example, pass/fail + a short reason).
4. Only build the UI (`showScore` pane, the score checks list) once real
   scores exist — don't ship the panel against a hardcoded 92%.

## Suggested shipping order

Phase 2 (trace) delivers the most visible fidelity-to-the-mock for the least
new product design, since the data's already flowing and just needs to stop
being thrown away. Phase 3 (permissions) rides along almost for free once
Phase 2's storage exists. Phase 1 (real conversation) is worth resolving
early only because it changes the composer's shape — better to know before
building UI around it. Phase 4 (scorecard) is a separate, larger effort;
don't block shipping 1-3 on it.
