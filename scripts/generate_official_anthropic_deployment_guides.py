"""
Generate and cache real deployment guides for the 8 curated Anthropic
product listings from scripts/seed_official_anthropic_profiles.py.

Calls the actual generation pipeline
(app.services.deployment_guide.get_or_generate_deployment_guide) — the
same function GET /public/agents/{tracent_id}/deployment-guide calls when
a user views an agent's page — instead of hand-writing instructions.
Requires ANTHROPIC_API_KEY to be configured wherever this runs, and
requires the 8 agent rows to already exist (run
scripts/seed_official_anthropic_profiles.py first).

Only generates what's missing. get_or_generate_deployment_guide already
does the "if there's no cached guide, generate now; if one exists and its
readme_fetched_at still matches, reuse it" check on its own — calling with
force=False (the default) means this script is safe to re-run: agents
that already have a guide are skipped, not re-generated, so repeat runs
don't burn extra API calls.

Honest tradeoff: 5 of the 8 listings (the API tools and Skills) have no
web_endpoint and no README (see docs/official-anthropic-profiles.md for
why one wasn't invented), so the real pipeline has no source material for
them and will store its own "No README or website content could be found"
placeholder — which is the system's real, correct behavior for an agent
with nothing to generate from, not a bug in this script.

Usage:
    python scripts/generate_official_anthropic_deployment_guides.py

Cleanup:
    DELETE FROM agent_deployment_guides
    WHERE tracent_id IN (SELECT tracent_id FROM agents WHERE source = 'anthropic-official');
"""
import asyncio

from app.db.database import close_db, init_db
from app.services.deployment_guide import get_or_generate_deployment_guide

TRACENT_IDS = [
    "trc_anthropic_claude_code",
    "trc_anthropic_claude_app",
    "trc_anthropic_claude_in_chrome",
    "trc_anthropic_web_search_tool",
    "trc_anthropic_code_execution_tool",
    "trc_anthropic_computer_use_tool",
    "trc_anthropic_artifact_design_skill",
    "trc_anthropic_dataviz_skill",
]
EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"]


async def generate() -> None:
    await init_db()
    try:
        for tracent_id in TRACENT_IDS:
            for level in EXPERIENCE_LEVELS:
                try:
                    result = await get_or_generate_deployment_guide(tracent_id, level, force=False)
                except LookupError:
                    print(f"  SKIPPED {tracent_id} — not found in agents (run seed_official_anthropic_profiles.py first)")
                    break
                status = "cached (already generated)" if result["cached"] else "generated now"
                material = "with real material" if result["has_readme"] else "no material found, stored placeholder"
                print(f"  {tracent_id} / {level}: {status}, {material}")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(generate())
