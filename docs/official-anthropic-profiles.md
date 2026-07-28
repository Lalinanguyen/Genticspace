# Official Anthropic profiles

`source = 'anthropic-official'` and `trust_tier = 'official'` are
Tracent-curated directory listings for first-party Anthropic products, API
tools, and Skills — Claude Code, Claude in Chrome, the built-in web
search/code execution/computer use tools, and official Skills like
Artifact design and data visualization.

Seeded by [`scripts/seed_official_anthropic_profiles.py`](../scripts/seed_official_anthropic_profiles.py).
No schema change needed — `agents.source` and `agents.trust_tier` are
plain `TEXT` columns, same as every other source value
(`erc8004`, `github`, `huggingface`, `npm`, `futurepedia`, `tracent`,
`tracent-hosted`, ...).

## Why not reuse `'tracent'` or `'tracent-hosted'`

- `source = 'tracent'` / `trust_tier = 'tracent'` means a listing was
  **self-submitted by a user** through the Contribute page
  (`frontend/app/contribute`, `POST /public/agents`), or **manually
  verified by an admin** (`app/services/verifier.py`'s
  `run_verification_review`). Neither describes an Anthropic-authored
  listing that Tracent itself curated.
- `trust_tier = 'tracent-hosted'` means Tracent wrote and runs the agent
  itself. These profiles aren't Tracent's own agents — they're Anthropic's
  products.

So a distinct `anthropic-official` source and `official` trust tier keeps
those three cases (user-submitted, Tracent-hosted, Anthropic-published)
each unambiguous.

## Where the label shows up

Unlike some earlier trust-tier work on this repo, `main` doesn't compute a
derived `trust_summary` label server-side — the frontend renders
`agent.trust_tier` directly via a small label map, duplicated in three
places today:

- `frontend/components/marketplace/AgentCard.tsx` (`TRUST_TIER_LABELS`)
- `frontend/components/marketplace/FilterSidebar.tsx` (`TRUST_TIERS`, also
  drives the trust-tier filter dropdown)
- `frontend/app/marketplace/[tracent_id]/page.tsx` (`TRUST_TIER_LABELS`)

All three now map `official` → `"Official"`, consistent with how
`onchain` → `"On-chain"` and `tracent` → `"Genticspace-verified"` already
work. There's no separate badge color per tier on `main` (all trust tags
render with the same cyan tag styling), so no new color scheme was
introduced.

## Data contract

- `agents.source` = `'anthropic-official'`
- `agents.source_id` = a stable slug (e.g. `claude-code`)
- `agents.provider_org` = `'Anthropic'`, `agents.provider_url` =
  `https://www.anthropic.com`
- `agents.verified` = `true`, `agents.trust_tier` = `'official'`
- `agents.web_endpoint` — only set when a real, confirmed public page
  exists (Claude Code, the Claude app, Claude in Chrome). Left `null` for
  the API tools and Skills, which don't have a standalone public page of
  their own — **a human should confirm/fill these in** before treating the
  list as final; nothing here is a guessed URL.
- `agent_skills` rows describe the capability; `agents.industry_tags` is
  set where a listing meaningfully fits an existing filter category
  (mostly `"Software Engineering"` for the developer-facing tools).

## Maintenance

This is Tracent-authored data, not something a scraper keeps in sync.
Re-run the seed script after editing its profile list; treat "is this
list still accurate" as a periodic manual check.
