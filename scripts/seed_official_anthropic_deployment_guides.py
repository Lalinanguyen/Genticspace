"""
Populate `agent_deployment_guides` for the 8 curated Anthropic product
listings from scripts/seed_official_anthropic_profiles.py.

Those listings have no GitHub/Hugging Face README and mostly no
`web_endpoint` either (see docs/official-anthropic-profiles.md) — the
normal path (app/services/deployment_guide.py's get_or_generate_deployment_guide,
which scrapes a README/website and asks Claude to write install steps from
it) would mostly produce its "No README or website content could be
found" placeholder for these, since they're not self-hostable software
with an install README in the first place.

Instead, this hand-writes real, accurate instructions for each product
(how to actually install/use Claude Code, enable Claude in Chrome, wire up
the API tools, etc.) in the same format
get_or_generate_deployment_guide's guides use: markdown "## Heading"
sections, numbered steps, one experience level (Beginner/Intermediate/
Advanced) per row, matching DeploymentGuideSection.tsx's rendering.

`readme_fetched_at` is left NULL to match these agents' own
`readme_fetched_at` (also NULL, since they're not github/huggingface
sourced) — get_or_generate_deployment_guide's cache check is
`cached.readme_fetched_at == agent.readme_fetched_at`, so this stays
cached indefinitely instead of being silently regenerated (and replaced
with the low-quality placeholder) the next time someone views the page.

Safe to re-run: upserted by (tracent_id, experience_level).

Usage:
    python scripts/seed_official_anthropic_deployment_guides.py

Cleanup:
    DELETE FROM agent_deployment_guides
    WHERE tracent_id IN (SELECT tracent_id FROM agents WHERE source = 'anthropic-official');
"""
import asyncio

from app.db.database import close_db, get_conn, init_db

GUIDES = {
    "trc_anthropic_claude_code": {
        "Beginner": """## What this is
Claude Code is a command-line tool you install on your computer that lets Claude read, write, and run code in your own project folder, right from your terminal.

## Prerequisites
1. Install Node.js version 18 or newer. Check by opening a terminal and running node --version. If that fails, download Node.js from nodejs.org and install it first.
2. Have an Anthropic account. You'll sign in with this when Claude Code first starts.

## Installation
1. Open a terminal (Mac: Terminal app; Windows: PowerShell or Command Prompt; Linux: your usual shell).
2. Run: npm install -g @anthropic-ai/claude-code
3. Navigate to the project you want help with, e.g. cd my-project.
4. Run: claude
5. A browser window opens asking you to log in with your Anthropic account. Follow the prompts to finish signing in.

## Running Claude Code
1. Type a request in plain English directly into the terminal, e.g. "add a login page" or "fix the failing test in auth.py", and press Enter.
2. Claude reads your code, proposes changes, and asks for your approval before editing files or running commands, unless you've configured it to act automatically.""",
        "Intermediate": """## Prerequisites
Node.js >= 18.

## Installation
1. npm install -g @anthropic-ai/claude-code
2. cd into your project directory.
3. Run claude to start an interactive session; authenticate via the browser flow on first run.

## Configuration
1. Optional: set ANTHROPIC_API_KEY as an environment variable to use API billing instead of a Claude subscription.
2. Optional: add a CLAUDE.md file at your project root with conventions/context you want Claude to always have.

## Running
Run claude from your project root for an interactive session, or claude -p "<prompt>" for a single non-interactive run (useful in scripts/CI).""",
        "Advanced": """## Installation
npm install -g @anthropic-ai/claude-code

## Configuration
ANTHROPIC_API_KEY env var for API-key billing (omit to use subscription auth via browser login). CLAUDE.md at project root for persistent project context. .claude/settings.json for permission modes and hooks.

## Running
Interactive: claude
Non-interactive/scriptable: claude -p "<prompt>" [--output-format json]""",
    },
    "trc_anthropic_claude_app": {
        "Beginner": """## What this is
Claude is Anthropic's chat assistant, available as a website and as a desktop app for Mac and Windows. No installation is required to use the web version.

## Getting started (web)
1. Go to claude.ai in your browser.
2. Click Sign up (or Log in) and follow the prompts using your email address.
3. Type a message in the box at the bottom of the screen and press Enter to start chatting.

## Getting started (desktop app)
1. Find the download link for the desktop app on claude.ai, or find "Claude" in your Mac App Store / Microsoft Store.
2. Install it like any other application.
3. Open the app and sign in with the same account you use on the website.""",
        "Intermediate": """## Access
Web: claude.ai (sign up or log in with email). Desktop: Mac/Windows app, same account.

## Usage
Start a new conversation, type your message, and press Enter. Use the model picker to choose between available Claude models depending on your plan.""",
        "Advanced": """## Access
claude.ai (web) or the native Mac/Windows desktop client, same account across both.

## Notes
No local setup required; auth is account-based, not API-key based, for this product.""",
    },
    "trc_anthropic_claude_in_chrome": {
        "Beginner": """## What this is
Claude in Chrome is a browser extension that lets Claude see the page you're looking at and take actions in your browser, like clicking buttons or filling out forms, with your permission.

## Prerequisites
1. Use the Google Chrome browser.
2. Have a Claude account (sign up at claude.ai if you don't have one).

## Installation
1. Open the Chrome Web Store and search for "Claude" (or follow the extension link from claude.ai's settings/extensions page).
2. Click Add to Chrome, then confirm when prompted.
3. Click the extensions icon (puzzle piece) in your Chrome toolbar and pin Claude so it's always visible.
4. Click the Claude icon and sign in with your Claude account.

## Using it
1. Go to any webpage.
2. Click the Claude in Chrome icon to open it.
3. Ask Claude to do something on the page, e.g. "summarize this article" or "fill out this form with my details," and approve any actions it proposes before it takes them.""",
        "Intermediate": """## Installation
Install "Claude in Chrome" from the Chrome Web Store, pin the extension, and sign in with your Claude account.

## Usage
Open the extension on any page to let Claude read page content and perform actions (clicks, form fills, navigation) that you approve.

## Permissions
Site-level permissions are granted per-domain the first time you use the extension there; review/revoke them from the extension's settings.""",
        "Advanced": """## Installation
Chrome Web Store -> "Claude in Chrome" -> Add to Chrome -> sign in.

## Notes
Acts within the user's own authenticated browser session; per-site permission grants; no separate API key required.""",
    },
    "trc_anthropic_web_search_tool": {
        "Beginner": """## What this is
The Web Search tool isn't something you install yourself, it's a feature you can turn on when building with Claude through Anthropic's API, so Claude can search the web and cite sources while answering.

## Prerequisites
1. An Anthropic API account and an API key, from the Anthropic Console.
2. Basic familiarity with making an API request, or a developer to help you.

## Enabling it
1. When your code sends a request to the Claude API, include a "tools" section listing the web search tool.
2. Send your request as usual. When Claude decides a web search would help, it performs the search automatically and includes cited sources in its reply.""",
        "Intermediate": """## Setup
Requires an Anthropic API key. Add a tool of type "web_search_20250305" (check docs.claude.com for the current dated version) to the tools array of your Messages API request.

## Usage
Claude decides when to invoke it during a conversation; results and citations are returned inline in the response content blocks.

## Configuration
Optional: max_uses, allowed_domains / blocked_domains to constrain search scope.""",
        "Advanced": """## Setup
tools: [{"type": "web_search_20250305", "name": "web_search", "max_uses": <int>, "allowed_domains": [...], "blocked_domains": [...]}] in the Messages API request. Requires ANTHROPIC_API_KEY.

## Notes
Model-invoked, not directly callable by you; citations returned as part of the response content.""",
    },
    "trc_anthropic_code_execution_tool": {
        "Beginner": """## What this is
The Code Execution tool lets Claude write and run code, for example to do a calculation or analyze a file, inside a secure sandbox, as part of answering your question, when you're building with Claude through Anthropic's API.

## Prerequisites
1. An Anthropic API account and API key.
2. A developer to integrate it, since this is a programming feature rather than an app you open yourself.

## Enabling it
1. In your API request to Claude, include the code execution tool in the "tools" list.
2. Ask Claude something that benefits from running code, e.g. "what's the standard deviation of this dataset," and Claude writes and runs the code itself, returning the result.""",
        "Intermediate": """## Setup
Requires an Anthropic API key. Add a tool of type "code_execution_20250522" (check docs.claude.com for the current version) to the tools array of your Messages API request.

## Usage
Claude writes and runs Python in a sandboxed container as needed; results are returned as part of the response. You can also upload files via the Files API for Claude to analyze.""",
        "Advanced": """## Setup
tools: [{"type": "code_execution_20250522", "name": "code_execution"}]. Some API versions require a beta header; check current docs.claude.com. Combine with the Files API to give the sandbox input files.

## Notes
Sandboxed, ephemeral per-request execution; no persistent state between calls unless you manage it yourself.""",
    },
    "trc_anthropic_computer_use_tool": {
        "Beginner": """## What this is
The Computer Use tool lets Claude look at a screenshot of a computer screen and control the mouse and keyboard, like a person would, when you're building with Claude through Anthropic's API. It's for developers building automation, not something you open as an app.

## Prerequisites
1. An Anthropic API account and API key.
2. A virtual machine or sandboxed environment for Claude to control, for safety this should not be your everyday computer.
3. A developer to set this up, since it involves running a virtual display and screenshot loop.

## Enabling it
1. Set up a virtual environment (for example a Docker container with a virtual display) that Claude's actions will be sent to.
2. In your API request, include the computer use tool, describing the screen resolution it should expect.
3. Send Claude a task; it looks at screenshots of the environment and responds with actions (clicks, keystrokes) for your code to carry out, in a loop, until the task is done.""",
        "Intermediate": """## Setup
Requires an Anthropic API key and a controllable environment (commonly a Dockerized virtual display) to execute the actions Claude requests. Add a tool of type "computer_20250124" (check docs.claude.com for the current version) with display_width_px / display_height_px to your Messages API request.

## Usage
Claude receives screenshots and returns tool_use blocks (mouse move, click, type, screenshot, etc.); your code executes them against the real environment and returns the result, looping until the task completes.""",
        "Advanced": """## Setup
tools: [{"type": "computer_20250124", "name": "computer", "display_width_px": ..., "display_height_px": ...}]. Anthropic publishes a reference Docker implementation; check docs.claude.com for the current one.

## Notes
Run only in an isolated/sandboxed environment; treat as executing arbitrary actions, not your primary machine.""",
    },
    "trc_anthropic_artifact_design_skill": {
        "Beginner": """## What this is
Artifact Design isn't a separate app to install, it's a Skill built into Claude that shapes how Claude designs Artifacts (documents, small apps, and visualizations) when you ask it to build one, inside claude.ai or Claude Code.

## Using it
1. Go to claude.ai (or use Claude Code) and start a conversation.
2. Ask Claude to build something visual or interactive, for example "make me a simple to-do list app" or "design a one-page resume."
3. Claude automatically applies this Skill's design guidance while building the Artifact; there's nothing to turn on yourself.""",
        "Intermediate": """## Access
Active automatically within claude.ai and Claude Code whenever Claude builds an Artifact; no separate setup.

## Usage
Ask for a document, app, or visualization; Claude applies this Skill's design conventions (typography, layout, accessibility) while generating it.""",
        "Advanced": """## Notes
Built-in Skill, not independently invocable via the API as a standalone tool; influences Artifact-generation behavior inside claude.ai/Claude Code sessions.""",
    },
    "trc_anthropic_dataviz_skill": {
        "Beginner": """## What this is
Data Visualization is a Skill built into Claude that guides how Claude builds charts, graphs, and dashboards whenever you ask for one, inside claude.ai or Claude Code. There's nothing separate to install.

## Using it
1. Go to claude.ai (or use Claude Code) and start a conversation.
2. Ask Claude to visualize some data, for example "chart my monthly sales numbers" or "build me a dashboard for this CSV."
3. Claude automatically applies this Skill's design guidance (chart type, color, accessibility) while building the visualization.""",
        "Intermediate": """## Access
Active automatically within claude.ai and Claude Code whenever Claude builds a chart, graph, or dashboard; no separate setup.

## Usage
Provide your data (pasted, uploaded, or referenced) and ask for a visualization; Claude applies this Skill's conventions for chart choice, color, and layout.""",
        "Advanced": """## Notes
Built-in Skill, not independently invocable via the API as a standalone tool; influences chart/dashboard generation behavior inside claude.ai/Claude Code sessions.""",
    },
}

_UPSERT_SQL = """
INSERT INTO agent_deployment_guides
    (tracent_id, experience_level, instructions, readme_fetched_at, has_material, generated_at)
VALUES ($1, $2, $3, NULL, TRUE, NOW())
ON CONFLICT (tracent_id, experience_level) DO UPDATE SET
    instructions      = EXCLUDED.instructions,
    readme_fetched_at = EXCLUDED.readme_fetched_at,
    has_material      = EXCLUDED.has_material,
    generated_at      = NOW()
"""


async def seed() -> None:
    await init_db()
    try:
        count = 0
        async with get_conn() as conn:
            for tracent_id, levels in GUIDES.items():
                agent = await conn.fetchrow("SELECT 1 FROM agents WHERE tracent_id = $1", tracent_id)
                if not agent:
                    print(f"  SKIPPED {tracent_id} — not found in agents (run seed_official_anthropic_profiles.py first)")
                    continue
                for level, instructions in levels.items():
                    await conn.execute(_UPSERT_SQL, tracent_id, level, instructions)
                    count += 1
                print(f"  seeded {tracent_id} — Beginner/Intermediate/Advanced")
        print(f"\nSeeded {count} deployment guide rows.")
        print(
            "Cleanup: DELETE FROM agent_deployment_guides WHERE tracent_id IN "
            "(SELECT tracent_id FROM agents WHERE source = 'anthropic-official');"
        )
    finally:
        await close_db()


if __name__ == "__main__":
    asyncio.run(seed())
