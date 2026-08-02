"""
License classification for the Repo Completion pipeline (see
app/services/repo_consent.py for what happens with the result).

Detection order, each a fallback for the previous:
1. GitHub's own detection (GET /repos/{owner}/{repo} -> license.spdx_id) --
   GitHub runs its own licensee-style detection server-side; cheapest and
   most reliable signal, avoids re-implementing LICENSE-file parsing for the
   common case.
2. LICENSE file content, if GitHub's own field is null/NOASSERTION.
3. Package manifest "license" fields (package.json/pyproject.toml/Cargo.toml),
   last resort.

Classification is deliberately coarser than raw SPDX -- four buckets only,
matching what the pipeline gates on:
  permissive  -- usable with attribution, proceeds automatically
  copyleft    -- flagged, routes to the consent flow
  unlicensed  -- no license found anywhere, routes to the consent flow
  unknown     -- something detected but not confidently mapped, or the
                 lookup itself failed/was rate limited -- routes to the
                 consent flow, never silently treated as permissive

This module does not reuse or modify description_backfill.py's
_normalize_license(), which deliberately collapses everything to a binary
"Open Source"/None for the marketplace's existing license filter -- that
stays as-is for its own job. _OSS_LICENSE_KEYS there is a useful reference
list, not something imported directly, since it doesn't distinguish
permissive from copyleft at all.
"""
import base64
import logging
import re
from dataclasses import dataclass

import httpx

from app.services.github_analysis import github_headers, github_rate_limit_wait

logger = logging.getLogger(__name__)

_GITHUB_API_BASE = "https://api.github.com"
_FETCH_TIMEOUT = 10.0

# SPDX identifiers, matched after lowercasing and stripping a trailing
# "-only"/"-or-later" (GitHub's own spdx_id field is usually already in the
# short form below, but LICENSE-file/manifest text can turn up either).
_PERMISSIVE = {
    "mit", "apache-2.0", "bsd-2-clause", "bsd-3-clause", "bsd-3-clause-clear",
    "isc", "0bsd", "unlicense", "cc0-1.0", "wtfpl", "bsl-1.0", "zlib",
    "artistic-2.0", "ecl-2.0", "ncsa", "postgresql", "python-2.0",
}
_COPYLEFT = {
    "gpl-1.0", "gpl-2.0", "gpl-3.0", "agpl-3.0", "lgpl-2.0", "lgpl-2.1",
    "lgpl-3.0", "mpl-1.1", "mpl-2.0", "epl-1.0", "epl-2.0", "osl-3.0",
    "eupl-1.1", "eupl-1.2", "cddl-1.0",
}
_SUFFIX_RE = re.compile(r"-(only|or-later)$")

_LICENSE_FILENAMES = ["LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING", "COPYING.md"]
_MANIFEST_FILES = ["package.json", "pyproject.toml", "Cargo.toml"]

# Distinctive early text from each license's canonical body, checked
# case-insensitively against a fetched LICENSE file. Best-effort fallback
# for the common case where GitHub's own detection already returned null --
# not a from-scratch license parser, so this list stays short and specific
# enough to avoid false positives rather than trying to be exhaustive.
_LICENSE_TEXT_FINGERPRINTS = {
    "mit": ["permission is hereby granted, free of charge"],
    "apache-2.0": ["apache license", "version 2.0"],
    "bsd-3-clause": [
        "redistributions of source code must retain the above copyright",
        "neither the name of",
    ],
    "bsd-2-clause": ["redistributions of source code must retain the above copyright"],
    "isc": ["permission to use, copy, modify, and/or distribute this software"],
    "unlicense": ["this is free and unencumbered software released into the public domain"],
    "agpl-3.0": ["gnu affero general public license"],
    "gpl-3.0": ["gnu general public license", "version 3"],
    "gpl-2.0": ["gnu general public license", "version 2"],
    "lgpl-3.0": ["gnu lesser general public license", "version 3"],
    "lgpl-2.1": ["gnu lesser general public license", "version 2.1"],
    "mpl-2.0": ["mozilla public license, v. 2.0"],
}


@dataclass
class LicenseResult:
    spdx_id: str | None
    classification: str  # permissive | copyleft | unlicensed | unknown
    source: str  # "github_api" | "license_file" | "manifest" | "not_found"


def _bucket(spdx_id: str | None) -> str:
    if not spdx_id:
        return "unlicensed"
    key = _SUFFIX_RE.sub("", spdx_id.lower().strip())
    if key in _PERMISSIVE:
        return "permissive"
    if key in _COPYLEFT:
        return "copyleft"
    return "unknown"


def _match_license_text(text: str) -> str | None:
    lowered = text.lower()
    for spdx_id, fingerprints in _LICENSE_TEXT_FINGERPRINTS.items():
        if all(fp in lowered for fp in fingerprints):
            return spdx_id
    return None


def _extract_manifest_license(filename: str, text: str) -> str | None:
    if filename == "package.json":
        match = re.search(r'"license"\s*:\s*"([^"]+)"', text)
    elif filename == "pyproject.toml":
        match = re.search(r'license\s*=\s*\{?\s*(?:text\s*=\s*)?"([^"]+)"', text)
    elif filename == "Cargo.toml":
        match = re.search(r'^license\s*=\s*"([^"]+)"', text, re.MULTILINE)
    else:
        return None
    return match.group(1) if match else None


async def _fetch_file_text(client: httpx.AsyncClient, owner_repo: str, filename: str) -> str | None:
    try:
        resp = await client.get(f"{_GITHUB_API_BASE}/repos/{owner_repo}/contents/{filename}")
    except httpx.HTTPError as exc:
        logger.debug("License classification: fetching %s/%s failed: %s", owner_repo, filename, exc)
        return None
    if resp.status_code != 200:
        return None
    data = resp.json()
    if data.get("encoding") != "base64":
        return None
    try:
        return base64.b64decode(data["content"]).decode("utf-8", errors="ignore")
    except Exception:
        return None


async def classify_license(owner_repo: str, client: httpx.AsyncClient | None = None) -> LicenseResult:
    """owner_repo is "owner/repo". Never raises -- a failed, rate-limited, or
    genuinely ambiguous lookup returns classification="unknown" rather than
    blocking the caller, since an unclassifiable candidate should route to
    consent review anyway, not crash the pipeline.

    client is optional and exists for testability (inject an
    httpx.AsyncClient built on httpx.MockTransport) and reuse across calls,
    matching app/services/github_analysis.py's convention -- real callers
    just call classify_license(owner_repo) and a client is owned locally."""
    if client is not None:
        return await _classify(owner_repo, client)
    async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT, headers=github_headers(), follow_redirects=True) as owned_client:
        return await _classify(owner_repo, owned_client)


async def _classify(owner_repo: str, client: httpx.AsyncClient) -> LicenseResult:
    try:
        resp = await client.get(f"{_GITHUB_API_BASE}/repos/{owner_repo}")
    except httpx.HTTPError as exc:
        logger.warning("License classification: repo fetch failed for %s: %s", owner_repo, exc)
        return LicenseResult(None, "unknown", "not_found")

    if github_rate_limit_wait(resp) is not None:
        logger.warning("License classification: rate limited on %s, backing off", owner_repo)
        return LicenseResult(None, "unknown", "not_found")

    if resp.status_code != 200:
        return LicenseResult(None, "unknown", "not_found")

    spdx_id = (resp.json().get("license") or {}).get("spdx_id")
    # GitHub returns the literal string "NOASSERTION" for repos with a
    # LICENSE file its own detector couldn't confidently identify -- treat
    # that the same as "nothing usable found here", not as a real
    # identifier to bucket on.
    if spdx_id and spdx_id != "NOASSERTION":
        return LicenseResult(spdx_id, _bucket(spdx_id), "github_api")

    for filename in _LICENSE_FILENAMES:
        text = await _fetch_file_text(client, owner_repo, filename)
        if text is None:
            continue
        matched = _match_license_text(text)
        if matched:
            return LicenseResult(matched, _bucket(matched), "license_file")
        # A LICENSE file exists but we couldn't fingerprint it -- a real
        # signal (some license was chosen), just not one classifiable with
        # confidence. Distinct from no file existing at all.
        return LicenseResult(None, "unknown", "license_file")

    for filename in _MANIFEST_FILES:
        text = await _fetch_file_text(client, owner_repo, filename)
        if text is None:
            continue
        manifest_license = _extract_manifest_license(filename, text)
        if manifest_license:
            return LicenseResult(manifest_license, _bucket(manifest_license), "manifest")

    return LicenseResult(None, "unlicensed", "not_found")
