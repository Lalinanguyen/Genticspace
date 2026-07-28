"""
Seed the `agents` table with curated profiles for official, first-party
Anthropic products, API tools, and Skills (Claude Code, Claude in Chrome,
the built-in web search/code execution/computer use tools, official
Skills).

Uses `source = 'anthropic-official'` and `trust_tier = 'anthropic-product'`
— new values, no schema change needed (`agents.source`/`agents.trust_tier`
are plain TEXT). See docs/official-anthropic-profiles.md for why these
needed a dedicated source/tier rather than reusing `'tracent'`
(self-submitted via the Contribute page) or `'tracent-hosted'` (Tracent's
own hosted agents) — and specifically why this tier is NOT called
'official' and does NOT set `verified = TRUE`: these listings are
Tracent-curated, not reviewed or endorsed by Anthropic, and must not imply
otherwise.

Every `web_endpoint` below is either a URL already confirmed elsewhere in
this app's own operating context (claude.ai/code) or a well-known
top-level Anthropic domain (claude.ai, docs.claude.com) — never a guessed,
product-specific path. Left `null` where no such confirmed link exists
(most API tools and Skills don't have a standalone public page) rather
than inventing one.

Safe to re-run: rows are upserted by (source, source_id), same pattern the
scraper services (e.g. app/services/futurepedia_scraper.py) use.

Usage:
    python scripts/seed_official_anthropic_profiles.py

Cleanup:
    DELETE FROM agents WHERE source = 'anthropic-official';
"""
import asyncio
import json
from datetime import datetime, timezone

from app.db.database import close_db, get_conn, init_db

_NOW = datetime.now(timezone.utc)
_ANTHROPIC_URL = "https://www.anthropic.com"

ANTHROPIC_PROFILES = [
    {
        "tracent_id": "trc_anthropic_claude_code",
        "source_id": "claude-code",
        "name": "Claude Code",
        "description": (
            "Anthropic's official command-line tool for agentic coding — "
            "reads, edits, and runs code directly in your terminal, IDE, "
            "or CI, using Claude models."
        ),
        "web_endpoint": "https://claude.ai/code",
        "industry_tags": ["Software Engineering"],
        "skills": [
            {"skill_id": "agentic-coding", "skill_name": "Agentic coding",
             "description": "Reads, edits, and runs code across a codebase from natural-language instructions.",
             "tags": ["coding", "cli", "developer-tools"]},
        ],
    },
    {
        "tracent_id": "trc_anthropic_claude_app",
        "source_id": "claude-app",
        "name": "Claude (desktop & web app)",
        "description": (
            "Anthropic's official Claude apps — desktop (Mac/Windows) and "
            "web (claude.ai) — for chatting with Claude directly."
        ),
        "web_endpoint": "https://claude.ai",
        "industry_tags": [],
        "skills": [
            {"skill_id": "chat", "skill_name": "Conversational assistant",
             "description": "General-purpose chat, writing, research, and analysis with Claude.",
             "tags": ["chat", "assistant"]},
        ],
    },
    {
        "tracent_id": "trc_anthropic_claude_in_chrome",
        "source_id": "claude-in-chrome",
        "name": "Claude in Chrome",
        "description": (
            "Anthropic's official Chrome extension that lets Claude see and "
            "act on web pages in your browser — clicking, filling forms, and "
            "navigating on your behalf. Installed as a Chrome extension and "
            "used from claude.ai."
        ),
        "web_endpoint": "https://claude.ai",
        "industry_tags": [],
        "skills": [
            {"skill_id": "browser-automation", "skill_name": "Browser automation",
             "description": "Clicks, fills forms, and navigates web pages in the user's own Chrome session.",
             "tags": ["browser", "automation"]},
        ],
    },
    {
        "tracent_id": "trc_anthropic_web_search_tool",
        "source_id": "web-search-tool",
        "name": "Web Search tool",
        "description": (
            "A built-in Claude API tool that lets Claude search the web and "
            "cite sources in its responses, without building a custom search "
            "integration."
        ),
        "web_endpoint": None,
        "industry_tags": ["Software Engineering"],
        "skills": [
            {"skill_id": "web-search", "skill_name": "Web search",
             "description": "Searches the web and returns cited results as part of a Claude API response.",
             "tags": ["api-tool", "search"]},
        ],
    },
    {
        "tracent_id": "trc_anthropic_code_execution_tool",
        "source_id": "code-execution-tool",
        "name": "Code Execution tool",
        "description": (
            "A built-in Claude API tool that runs code in a sandboxed "
            "environment during a conversation, for calculations, data "
            "analysis, and file processing."
        ),
        "web_endpoint": None,
        "industry_tags": ["Software Engineering"],
        "skills": [
            {"skill_id": "code-execution", "skill_name": "Sandboxed code execution",
             "description": "Runs code in a sandbox and returns the result as part of a Claude API response.",
             "tags": ["api-tool", "code-execution"]},
        ],
    },
    {
        "tracent_id": "trc_anthropic_computer_use_tool",
        "source_id": "computer-use-tool",
        "name": "Computer Use tool",
        "description": (
            "A built-in Claude API tool that lets Claude view a screen and "
            "control a mouse and keyboard to operate software the way a "
            "person would."
        ),
        "web_endpoint": None,
        "industry_tags": ["Software Engineering"],
        "skills": [
            {"skill_id": "computer-use", "skill_name": "Screen & input control",
             "description": "Views a screen and controls mouse/keyboard input to operate software.",
             "tags": ["api-tool", "computer-use"]},
        ],
    },
    {
        "tracent_id": "trc_anthropic_artifact_design_skill",
        "source_id": "artifact-design-skill",
        "name": "Artifact Design (official Skill)",
        "description": (
            "An official Claude Skill that shapes how Claude designs and "
            "builds Artifacts — standalone documents, apps, and "
            "visualizations rendered directly in the conversation."
        ),
        "web_endpoint": None,
        "industry_tags": [],
        "skills": [
            {"skill_id": "artifact-design", "skill_name": "Artifact design",
             "description": "Guides how Claude designs and builds Artifacts (documents, apps, visualizations).",
             "tags": ["skill", "artifacts", "design"]},
        ],
    },
    {
        "tracent_id": "trc_anthropic_dataviz_skill",
        "source_id": "dataviz-skill",
        "name": "Data Visualization (official Skill)",
        "description": (
            "An official Claude Skill for building charts, graphs, and "
            "dashboards with consistent, accessible design, used whenever "
            "Claude creates a data visualization."
        ),
        "web_endpoint": None,
        "industry_tags": [],
        "skills": [
            {"skill_id": "dataviz", "skill_name": "Data visualization",
             "description": "Guides how Claude builds charts, graphs, and dashboards.",
             "tags": ["skill", "data-visualization", "design"]},
        ],
    },
]

_UPSERT_AGENT_SQL = """
INSERT INTO agents (
    tracent_id, source, source_id,
    name, description,
    is_active, x402_support,
    web_endpoint, endpoints_live,
    provider_org, provider_url,
    industry_tags,
    verified, trust_tier, verified_at,
    risk_score, safe_to_transact,
    last_indexed
) VALUES (
    $1, 'anthropic-official', $2,
    $3, $4,
    TRUE, FALSE,
    $5, NULL,
    'Anthropic', $6,
    $7,
    FALSE, 'anthropic-product', $8,
    0.0, FALSE,
    NOW()
)
ON CONFLICT (source, source_id) DO UPDATE SET
    tracent_id       = agents.tracent_id,
    name              = EXCLUDED.name,
    description       = EXCLUDED.description,
    is_active         = EXCLUDED.is_active,
    x402_support      = EXCLUDED.x402_support,
    web_endpoint      = EXCLUDED.web_endpoint,
    provider_org      = EXCLUDED.provider_org,
    provider_url      = EXCLUDED.provider_url,
    industry_tags     = EXCLUDED.industry_tags,
    verified          = EXCLUDED.verified,
    trust_tier        = EXCLUDED.trust_tier,
    verified_at       = EXCLUDED.verified_at,
    risk_score        = EXCLUDED.risk_score,
    safe_to_transact  = EXCLUDED.safe_to_transact,
    last_indexed      = NOW()
"""


async def _seed_profile(conn, profile: dict) -> str:
    await conn.execute(
        _UPSERT_AGENT_SQL,
        profile["tracent_id"], profile["source_id"],
        profile["name"], profile["description"],
        profile["web_endpoint"], _ANTHROPIC_URL,
        profile.get("industry_tags") or [],
        _NOW,
    )
    row = await conn.fetchrow(
        "SELECT tracent_id FROM agents WHERE source = 'anthropic-official' AND source_id = $1",
        profile["source_id"],
    )
    tracent_id = row["tracent_id"]

    await conn.execute("DELETE FROM agent_skills WHERE tracent_id = $1", tracent_id)
    for skill in profile.get("skills", []):
        await conn.execute(
            """
            INSERT INTO agent_skills (tracent_id, skill_id, skill_name, description, tags)
            VALUES ($1, $2, $3, $4, $5)
            """,
            tracent_id, skill.get("skill_id"), skill.get("skill_name"),
            skill.get("description"), json.dumps(skill.get("tags", [])),
        )

    return tracent_id


async def seed() -> None:
    await init_db()
    try:
        async with get_conn() as conn:
            for profile in ANTHROPIC_PROFILES:
                tracent_id = await _seed_profile(conn, profile)
                print(f"  seeded {tracent_id} (anthropic-official/{profile['source_id']}) — {profile['name']}")
        print(f"\nSeeded {len(ANTHROPIC_PROFILES)} Anthropic product listings.")
        print("Cleanup: DELETE FROM agents WHERE source = 'anthropic-official';")
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(seed())
