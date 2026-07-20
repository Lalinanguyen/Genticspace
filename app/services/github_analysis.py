import base64
import logging
import time

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_MANIFEST_FILES = ["package.json", "requirements.txt", "pyproject.toml"]

_LIB_MARKERS = {
    "mcp": ["@modelcontextprotocol/sdk", "fastmcp", '"mcp"', "\nmcp", "mcp>=", "mcp=="],
    "a2a": ["a2a-sdk", "python-a2a", '"a2a"', "a2a>=", "a2a=="],
    "x402": ["x402"],
    "web3": ["web3", "ethers"],
}


def github_headers() -> dict:
    headers = {"Accept": "application/vnd.github+json"}
    if settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    return headers


def github_rate_limit_wait(resp: httpx.Response) -> float | None:
    """Seconds until the GitHub rate limit resets if resp shows it's exhausted
    (403/429 with X-RateLimit-Remaining: 0), else None. Callers should stop
    their batch rather than burn through remaining candidates against a dead
    limit, and leave those candidates unmarked so they're retried later."""
    if resp.status_code not in (403, 429):
        return None
    if resp.headers.get("x-ratelimit-remaining") != "0":
        return None
    reset = resp.headers.get("x-ratelimit-reset")
    if not reset:
        return 60.0
    try:
        return max(float(reset) - time.time(), 1.0)
    except ValueError:
        return 60.0


class GithubAnalysis:
    def __init__(self, languages: set[str], detected_libs: set[str], repo_count: int, rate_limited: bool):
        self.languages = languages
        self.detected_libs = detected_libs
        self.repo_count = repo_count
        self.rate_limited = rate_limited


async def analyze_github_username(client: httpx.AsyncClient, username: str, sample_size: int = 5) -> GithubAnalysis:
    """Sample a GitHub user/org's most recently updated repos for languages and
    agent-protocol library usage (MCP/A2A/x402/web3), detected via manifest files.

    Shared by both the per-user onboarding cache (github_signals.py) and the
    bulk profile scraper (github_profile_scraper.py) so the detection logic
    lives in exactly one place.
    """
    languages: set[str] = set()
    detected_libs: set[str] = set()
    repo_count = 0
    rate_limited = False

    try:
        resp = await client.get(
            f"https://api.github.com/users/{username}/repos",
            params={"sort": "updated", "per_page": 20},
        )
        if resp.status_code == 403:
            rate_limited = True
        elif resp.status_code == 200:
            repos = resp.json()
            repo_count = len(repos)
            for repo in repos[:sample_size]:
                full_name = repo.get("full_name")
                if not full_name:
                    continue

                lang_resp = await client.get(f"https://api.github.com/repos/{full_name}/languages")
                if lang_resp.status_code == 200:
                    languages.update(lang_resp.json().keys())
                elif lang_resp.status_code == 403:
                    rate_limited = True

                for manifest in _MANIFEST_FILES:
                    content_resp = await client.get(
                        f"https://api.github.com/repos/{full_name}/contents/{manifest}"
                    )
                    if content_resp.status_code == 403:
                        rate_limited = True
                        continue
                    if content_resp.status_code != 200:
                        continue
                    try:
                        text = base64.b64decode(content_resp.json().get("content", "")).decode(
                            "utf-8", errors="ignore"
                        ).lower()
                    except Exception:
                        continue
                    for lib, markers in _LIB_MARKERS.items():
                        if any(marker.lower() in text for marker in markers):
                            detected_libs.add(lib)
    except httpx.HTTPError as exc:
        logger.warning("GitHub codebase analysis failed for %s: %s", username, exc)

    return GithubAnalysis(languages, detected_libs, repo_count, rate_limited)
