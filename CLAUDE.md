# Engineering practices for this repo

Habits worth applying on any branch/worktree here, distilled from real
incidents this session — not aspirational, each one caught something real.

## Before declaring a deploy "shipped"

Deploy logs reporting success is not proof the change is live. Twice this
session a deploy reported success while serving stale content:
- Fly's remote (Depot) builder served a stale cached image layer despite
  changed source (frontend app).
- `fly deploy --build-only --push` never updates the `:latest` tag by
  default (it tags `deployment-{timestamp}` instead) — `SANDBOX_IMAGE`
  pointing at `:latest` meant a prior sandbox image change may not have
  reached production at all.

Checklist:
1. `fly deploy --no-cache ...` when in doubt, always for anything
   security-relevant (the sandbox image).
2. After deploying, `fly ssh console -a <app> -C "grep -c '<known string
   from your change>' /app/.next/server/app/<route>/page.js"` (or the
   equivalent compiled artifact) — confirm the change is actually on disk
   in the running machine before trusting it.
3. For anything with an explicit tag dependency (`SANDBOX_IMAGE =
   ...:latest`), pass `--image-label latest` explicitly on push — don't
   assume a bare push updates the tag your code reads.
4. Verify with a fresh, cache-busted browser request (`?t=timestamp`,
   `bypassCSP`), not a cached tab.

## Security-sensitive code (Sandbox Mode execution path)

`sandbox/supervisor.py`, `app/services/fly_machines.py`,
`Dockerfile.sandbox` run arbitrary third-party code. Treat any change here
as security review, not a normal PR:
- Which steps execute attacker-controlled code, and what runs before vs.
  after network lockdown?
- Which steps run as root vs. the unprivileged `sandbox` user?
- Is the egress allowlist actually host-scoped, or just port-scoped (ports
  open to any destination is a real gap, not a narrow one)?
- Don't trust a rule "should" work — verify against a real throwaway Fly
  Machine (`fly machine run <image> --rm -e ... -- <command>`), not just a
  code read. Found real discrepancies between "should work" and "does
  work" more than once this session.
- See `docs/sandbox-hardening-plan.md` for the last full pass and what's
  still open (egress logging, resource caps, `docs/sandbox-execution-
  architecture.md` on `deslop` proposes a stricter curated-cohort model
  that `main`'s self-serve implementation doesn't currently match — worth
  resolving deliberately, not by accident).

## UI consistency sweep

This repo has two color palettes layered in its history: an older dark
theme (`#22D3EE`, `rgba(244,247,243,X)`, `#F4F7F3`) and the current light
theme (`#35C0B0`, `rgba(28,38,33,X)`, `#1C2621`/`#EEF1EA`). Old-theme
literals don't error, don't warn, and render as low/zero contrast on the
light theme — invisible text, invisible borders, muddy shadows. Found on
four separate pages so far (sign-up/sign-in, user profile, company
profile, marketplace cards) each only after someone noticed it live.

Before shipping any UI change: `grep -rn "22D3EE\|244,247,243\|F4F7F3\|00171F\|0,23,31" frontend/` and fix what it finds, rather than waiting for the next page to be reported broken.

## Branch/worktree state

Multiple long-lived worktrees exist under `orca/workspaces/Tracent/*`, one
per feature branch. Several (`Frontend-Correctness-Content`, `Info-gen`,
`Performance-Data-Integrity`, `Reliability-Observability`,
`Trust-Reviews-Admin-Moderation`) currently have real uncommitted
working-tree changes sitting in them. Check `git status` in a worktree
before assuming it's clean or that a branch is actually empty.
