"""
One-off script: record an admin's decision to admit a specific agent into
the Sandbox Mode Track B cohort — the small, manually hand-picked set of
third-party agents under consideration for eventually running their own
code in Genticspace's sandbox. See docs/sandbox-execution-architecture.md
for the full design spike this script is scaffolding for.

This script does NOT and CANNOT mark an agent as security-cleared to
actually run. It only inserts a `sandbox_cohort` row with
`status = 'pending_security_review'` — the only status value this script
ever writes. Moving a row to `status = 'approved'` is a separate, manual,
out-of-band step an admin takes later, once the security baseline
docs/sandbox-execution-architecture.md §2 requires (image scanning, no
outbound network by default, resource quotas, a documented kill-switch)
actually exists and has been run against this specific agent. None of that
exists yet, so nothing this script does should ever be mistaken for a
green light to execute the agent's code.

Refuses (prints an error and exits nonzero, inserts nothing) if:
  - the agent doesn't exist (no matching genticspace_id in `agents`), or
  - the agent's license isn't exactly 'Open Source' (the same literal
    value app/services/agent_queries.py's compute_sandbox_fields() checks
    for Track A's sandboxable flag — see
    docs/sandbox-execution-architecture.md §1). This is a necessary floor,
    not sufficient by itself — see that doc's §4 on why a license-string
    match still requires a human legal-adjacent review before real
    execution, which this script does not perform or substitute for.

There is no admin-user concept distinct from the master/per-client API key
in this codebase (see app/db/auth.py's verify_api_key, which doesn't
distinguish "master" from "per-client" callers). So `--admitted-by` is a
free-text identifier for whoever is running this script — an admin's email
is the expected convention — not a foreign key into any users/admins table.

Usage:
    python -m scripts.admit_to_sandbox_cohort \\
        --genticspace-id trc_abc123 \\
        --admitted-by admin@genticspace.example \\
        [--manifest-path agents/third-party/some-agent/genticspace.yaml]

Safe to re-run: upserted by genticspace_id (the table's primary key). A
re-run does NOT reset status back to 'pending_security_review' if it has
already been manually moved to 'approved' or 'rejected' — see the
ON CONFLICT clause below.

Cleanup:
    DELETE FROM sandbox_cohort WHERE genticspace_id = '<id>';
"""
import argparse
import asyncio
import sys

from app.db.database import close_db, get_conn, init_db

_LOOKUP_SQL = """
SELECT genticspace_id, name, source, source_id, license
FROM agents
WHERE genticspace_id = $1
"""

# ON CONFLICT deliberately does NOT overwrite `status`: re-running this
# script against an already-admitted agent (e.g. to update manifest_path
# once a manifest exists) must never silently reset a manually-approved or
# manually-rejected row back to 'pending_security_review'. admitted_at /
# admitted_by ARE refreshed, since a re-run is itself a new admission
# action worth recording.
_UPSERT_SQL = """
INSERT INTO sandbox_cohort (
    genticspace_id, admitted_at, admitted_by, manifest_path, status
) VALUES (
    $1, NOW(), $2, $3, 'pending_security_review'
)
ON CONFLICT (genticspace_id) DO UPDATE SET
    admitted_at   = NOW(),
    admitted_by   = EXCLUDED.admitted_by,
    manifest_path = EXCLUDED.manifest_path
RETURNING genticspace_id, admitted_at, admitted_by, manifest_path, status
"""


async def admit(genticspace_id: str, admitted_by: str, manifest_path: str | None) -> dict:
    await init_db()
    try:
        async with get_conn() as conn:
            agent = await conn.fetchrow(_LOOKUP_SQL, genticspace_id)
            if agent is None:
                print(f"ERROR: no agent found with genticspace_id = {genticspace_id!r}. Nothing inserted.", file=sys.stderr)
                sys.exit(1)

            if agent["license"] != "Open Source":
                print(
                    f"ERROR: agent {genticspace_id} ({agent['name']!r}) has "
                    f"license = {agent['license']!r}, not 'Open Source'. "
                    "Sandbox cohort admission requires license = 'Open Source' "
                    "(see docs/sandbox-execution-architecture.md, section 1). "
                    "Nothing inserted.",
                    file=sys.stderr,
                )
                sys.exit(1)

            row = await conn.fetchrow(_UPSERT_SQL, genticspace_id, admitted_by, manifest_path)
            return dict(row), dict(agent)
    finally:
        await close_db()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--genticspace-id", required=True,
        help="genticspace_id of the agent to admit into the sandbox cohort.",
    )
    parser.add_argument(
        "--admitted-by", required=True,
        help="Free-text identifier for the admin making this decision (e.g. an email). "
             "There is no admin-user table this is validated against.",
    )
    parser.add_argument(
        "--manifest-path", default=None,
        help="Where this agent's Dockerfile/manifest would live once one exists. "
             "Optional — nullable, since no manifests exist yet for any cohort agent.",
    )
    args = parser.parse_args()

    cohort_row, agent_row = asyncio.run(
        admit(args.genticspace_id, args.admitted_by, args.manifest_path)
    )

    print(f"Admitted {cohort_row['genticspace_id']} ({agent_row['name']!r}, "
          f"source={agent_row['source']}, source_id={agent_row['source_id']}) "
          "into the sandbox cohort.")
    print(f"  admitted_by    = {cohort_row['admitted_by']}")
    print(f"  admitted_at    = {cohort_row['admitted_at']}")
    print(f"  manifest_path  = {cohort_row['manifest_path']}")
    print(f"  status         = {cohort_row['status']}")
    print()
    print(
        "REMINDER: status is 'pending_security_review' and must stay that way "
        "until the security baseline in docs/sandbox-execution-architecture.md "
        "section 2 (image scanning, no outbound network by default, resource quotas, "
        "a documented kill-switch) actually exists and has been run against "
        "this agent. Only then should an admin manually move this row's "
        "status to 'approved' -- this script never does that itself."
    )
