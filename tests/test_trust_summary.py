"""
Unit tests for app/services/trust_summary.py's compute_trust_summary.

Pure function, no DB involved. Covers every one of the 5 labels in
TRUST_SUMMARY_LABELS and, per the precedence documented in the function's
own docstring, every case where two labels' conditions are simultaneously
true (to prove the *higher* one wins, not just that each label is reachable
in isolation):

    1. tracent_verified  (trust_tier == "tracent")
    2. tracent_hosted    (trust_tier == "tracent-hosted")
    3. flagged           (has_high_severity_flag)
    4. verified          (verified and trust_tier == "onchain")
    5. unverified        (everything else)
"""
import pytest

from app.services.trust_summary import TRUST_SUMMARY_LABELS, compute_trust_summary


def test_label_set_is_exactly_five_and_matches_docstring():
    assert TRUST_SUMMARY_LABELS == (
        "tracent_verified", "tracent_hosted", "verified", "flagged", "unverified",
    )


# --- Branch 1: tracent_verified, unconditional winner ----------------------

@pytest.mark.parametrize(
    "verified, has_high_severity_flag",
    [(False, False), (True, False), (False, True), (True, True)],
)
def test_tracent_verified_wins_regardless_of_other_fields(verified, has_high_severity_flag):
    assert compute_trust_summary(
        trust_tier="tracent",
        verified=verified,
        has_high_severity_flag=has_high_severity_flag,
    ) == "tracent_verified"


# --- Branch 2: tracent_hosted, beats flagged but loses to tracent_verified --

@pytest.mark.parametrize(
    "verified, has_high_severity_flag",
    [(False, False), (True, False), (False, True), (True, True)],
)
def test_tracent_hosted_beats_flagged_and_verified(verified, has_high_severity_flag):
    assert compute_trust_summary(
        trust_tier="tracent-hosted",
        verified=verified,
        has_high_severity_flag=has_high_severity_flag,
    ) == "tracent_hosted"


def test_tracent_verified_beats_tracent_hosted_when_somehow_both_would_apply():
    # trust_tier is a single field so these two can never literally co-occur,
    # but the precedence check ("tracent" is checked strictly before
    # "tracent-hosted") is still worth pinning: if trust_tier == "tracent",
    # the function must never fall through to the tracent-hosted branch.
    assert compute_trust_summary(
        trust_tier="tracent", verified=False, has_high_severity_flag=False,
    ) == "tracent_verified"


# --- Branch 3: flagged, beats verified/unverified but loses to tiers 1 & 2 -

def test_flagged_beats_verified_even_when_onchain_and_verified_true():
    # The specific case the docstring calls out: a high-severity flag
    # overrides an otherwise-passing onchain verification.
    assert compute_trust_summary(
        trust_tier="onchain",
        verified=True,
        has_high_severity_flag=True,
    ) == "flagged"


def test_flagged_with_no_trust_tier():
    assert compute_trust_summary(
        trust_tier=None,
        verified=False,
        has_high_severity_flag=True,
    ) == "flagged"


def test_flagged_with_verified_false_and_onchain_tier():
    assert compute_trust_summary(
        trust_tier="onchain",
        verified=False,
        has_high_severity_flag=True,
    ) == "flagged"


def test_tracent_hosted_beats_flagged_precedence_explicitly():
    assert compute_trust_summary(
        trust_tier="tracent-hosted",
        verified=False,
        has_high_severity_flag=True,
    ) == "tracent_hosted"


# --- Branch 4: verified — requires BOTH verified=True AND trust_tier=onchain

def test_verified_requires_both_onchain_tier_and_verified_flag():
    assert compute_trust_summary(
        trust_tier="onchain",
        verified=True,
        has_high_severity_flag=False,
    ) == "verified"


def test_onchain_tier_alone_without_verified_flag_is_not_verified():
    # trust_tier == "onchain" but verified is False: should NOT reach "verified".
    assert compute_trust_summary(
        trust_tier="onchain",
        verified=False,
        has_high_severity_flag=False,
    ) == "unverified"


def test_verified_flag_alone_without_onchain_tier_is_not_verified():
    # verified True but trust_tier is something else entirely (e.g. None):
    # should NOT reach "verified" since trust_tier != "onchain".
    assert compute_trust_summary(
        trust_tier=None,
        verified=True,
        has_high_severity_flag=False,
    ) == "unverified"


# --- Branch 5: unverified — the fallback ------------------------------------

@pytest.mark.parametrize("trust_tier", [None, "onchain", "something-unrecognized", "github", "huggingface"])
def test_unverified_fallback(trust_tier):
    assert compute_trust_summary(
        trust_tier=trust_tier,
        verified=False,
        has_high_severity_flag=False,
    ) == "unverified"


# --- Every distinct return value must be a member of TRUST_SUMMARY_LABELS --

@pytest.mark.parametrize(
    "trust_tier, verified, has_high_severity_flag",
    [
        ("tracent", False, False),
        ("tracent-hosted", False, False),
        (None, False, True),
        ("onchain", True, False),
        (None, False, False),
    ],
)
def test_every_branch_returns_a_declared_label(trust_tier, verified, has_high_severity_flag):
    result = compute_trust_summary(
        trust_tier=trust_tier, verified=verified, has_high_severity_flag=has_high_severity_flag,
    )
    assert result in TRUST_SUMMARY_LABELS
