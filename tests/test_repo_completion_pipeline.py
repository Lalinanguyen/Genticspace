from app.services import repo_completion_pipeline as pipeline
from app.services.license_classifier import LicenseResult


def test_tokenize_drops_stopwords_and_short_tokens():
    tokens = pipeline._tokenize("An AI Agent for invoice reconciliation, built with Python")
    assert tokens == {"invoice", "reconciliation", "built", "python"}
    # Stopwords ("an"/"ai"/"agent"/"for"/"with") and sub-3-char tokens never appear.
    assert not tokens & {"an", "ai", "agent", "for", "with"}


def test_tokenize_is_case_insensitive_and_deduplicates():
    assert pipeline._tokenize("Invoice invoice INVOICE") == {"invoice"}


def test_owner_repo_from_github_url_strips_scheme_and_trailing_slash():
    assert pipeline.owner_repo_from_github_url("https://github.com/owner/repo") == "owner/repo"
    assert pipeline.owner_repo_from_github_url("https://github.com/owner/repo/") == "owner/repo"
    assert pipeline.owner_repo_from_github_url("http://github.com/owner/repo") == "owner/repo"


def _pick(tracent_id: str, github_url: str) -> dict:
    return {"tracent_id": tracent_id, "github_url": github_url, "source_id": github_url.split("github.com/")[-1]}


async def test_license_gate_keeps_only_permissive_picks(monkeypatch):
    results = {
        "owner/mit-repo": LicenseResult("MIT", "permissive", "github_api"),
        "owner/gpl-repo": LicenseResult("GPL-3.0", "copyleft", "github_api"),
        "owner/mystery-repo": LicenseResult(None, "unknown", "not_found"),
    }

    async def fake_classify(owner_repo, client=None):
        return results[owner_repo]

    monkeypatch.setattr(pipeline, "classify_license", fake_classify)

    picks = [
        _pick("a1", "https://github.com/owner/mit-repo"),
        _pick("a2", "https://github.com/owner/gpl-repo"),
        _pick("a3", "https://github.com/owner/mystery-repo"),
    ]

    gated = await pipeline.license_gate(picks)

    assert [p["tracent_id"] for p in gated] == ["a1"]
    assert gated[0]["license_classification"] == "permissive"


async def test_license_gate_returns_empty_when_nothing_permissive(monkeypatch):
    async def fake_classify(owner_repo, client=None):
        return LicenseResult("GPL-3.0", "copyleft", "github_api")

    monkeypatch.setattr(pipeline, "classify_license", fake_classify)

    gated = await pipeline.license_gate([_pick("a1", "https://github.com/owner/gpl-repo")])

    assert gated == []


async def test_license_gate_annotates_every_pick_not_just_kept_ones(monkeypatch):
    # A caller needs the classification recorded for rejected picks too, to
    # persist a full picture of what was considered (see
    # scripts/run_repo_completion_pilot.py::_record_sources).
    async def fake_classify(owner_repo, client=None):
        return LicenseResult("GPL-3.0", "copyleft", "github_api")

    monkeypatch.setattr(pipeline, "classify_license", fake_classify)

    picks = [_pick("a1", "https://github.com/owner/gpl-repo")]
    await pipeline.license_gate(picks)

    assert picks[0]["license_classification"] == "copyleft"
    assert picks[0]["license_spdx_id"] == "GPL-3.0"
