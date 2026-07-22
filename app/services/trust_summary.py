"""
Maps an agent's raw trust fields (verified, trust_tier, risk_score,
safe_to_transact, reputation_flags) onto a small fixed set of user-facing
labels: "genticspace_verified", "genticspace_hosted", "verified", "flagged",
"unverified".

This is a presentation-layer contract: frontend code renders these labels
directly to non-technical end users with no further interpretation, so the
label set and precedence below are the source of truth.
"""
from typing import Optional

TRUST_SUMMARY_LABELS = ("genticspace_verified", "genticspace_hosted", "verified", "flagged", "unverified")


def compute_trust_summary(
    *,
    trust_tier: Optional[str],
    verified: bool,
    has_high_severity_flag: bool,
) -> str:
    """
    Precedence (first match wins):

      1. "genticspace_verified" — trust_tier == "genticspace": a human reviewer on
         the Genticspace team manually approved this agent through the paid
         Tier 2 review flow (see admin_verify / run_verification_review).
         Overrides everything else below, since a human already looked at
         any risk signals.

      2. "genticspace_hosted" — trust_tier == "genticspace-hosted": Genticspace wrote
         and runs this agent itself (source == 'genticspace-hosted'; see
         docs/hosting-architecture.md). Distinct from "genticspace_verified" —
         that label means a human reviewed someone else's agent; this one
         means Genticspace is the first-party author/operator. Overrides
         "flagged" for the same reason genticspace_verified does: Genticspace is
         directly attesting to code it controls end to end.

      3. "flagged" — the agent has at least one open HIGH-severity row in
         reputation_flags (currently: ownership_transfer or rapid_resale;
         see run_auto_verification) and did not reach a Genticspace-attested
         tier above. Shown even for an otherwise auto-verified ("onchain")
         agent, because a high-severity flag means it should not be
         presented to end users as safe.

      4. "verified" — trust_tier == "onchain" and verified is true: the
         indexer's auto-verification passed (exists on-chain, endpoints
         live, zero ownership transfers, valid agent card) and there's no
         high-severity flag.

      5. "unverified" — everything else: trust_tier is null/unset, or the
         agent failed auto-verification (includes deslop's non-erc8004
         scraped sources — github/huggingface/npm/futurepedia/ycombinator/
         genticspace-contributed listings — which don't go through on-chain
         auto-verification at all and so are "unverified" by default until
         separately reviewed).

    risk_score and safe_to_transact are intentionally NOT separate inputs
    here: risk_score already drives whether trust_tier="onchain" happens in
    run_auto_verification, and reputation_flags (by severity) is a more
    precise, legible signal for "flagged" than picking an arbitrary
    risk_score cutoff a second time would be.
    """
    if trust_tier == "genticspace":
        return "genticspace_verified"
    if trust_tier == "genticspace-hosted":
        return "genticspace_hosted"
    if has_high_severity_flag:
        return "flagged"
    if verified and trust_tier == "onchain":
        return "verified"
    return "unverified"
