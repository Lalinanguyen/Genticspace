"""
Maps an agent's raw trust fields (verified, trust_tier, risk_score,
safe_to_transact, reputation_flags) onto a small fixed set of user-facing
labels: "tracent_verified", "tracent_hosted", "verified", "flagged",
"unverified".

This is a presentation-layer contract: frontend code renders these labels
directly to non-technical end users with no further interpretation, so the
label set and precedence below are the source of truth.
"""
from typing import Optional

TRUST_SUMMARY_LABELS = ("tracent_verified", "tracent_hosted", "verified", "flagged", "unverified")


def compute_trust_summary(
    *,
    trust_tier: Optional[str],
    verified: bool,
    has_high_severity_flag: bool,
) -> str:
    """
    Precedence (first match wins):

      1. "tracent_verified" — trust_tier == "tracent": a human reviewer on
         the Tracent team manually approved this agent through the paid
         Tier 2 review flow (see admin_verify / run_verification_review).
         Overrides everything else below, since a human already looked at
         any risk signals.

      2. "tracent_hosted" — trust_tier == "tracent-hosted": Tracent wrote
         and runs this agent itself (source == 'tracent-hosted'; see
         docs/hosting-architecture.md). Distinct from "tracent_verified" —
         that label means a human reviewed someone else's agent; this one
         means Tracent is the first-party author/operator. Overrides
         "flagged" for the same reason tracent_verified does: Tracent is
         directly attesting to code it controls end to end.

      3. "flagged" — the agent has at least one open HIGH-severity row in
         reputation_flags (currently: ownership_transfer or rapid_resale;
         see run_auto_verification) and did not reach a Tracent-attested
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
         tracent-contributed listings — which don't go through on-chain
         auto-verification at all and so are "unverified" by default until
         separately reviewed).

    risk_score and safe_to_transact are intentionally NOT separate inputs
    here: risk_score already drives whether trust_tier="onchain" happens in
    run_auto_verification, and reputation_flags (by severity) is a more
    precise, legible signal for "flagged" than picking an arbitrary
    risk_score cutoff a second time would be.
    """
    if trust_tier == "tracent":
        return "tracent_verified"
    if trust_tier == "tracent-hosted":
        return "tracent_hosted"
    if has_high_severity_flag:
        return "flagged"
    if verified and trust_tier == "onchain":
        return "verified"
    return "unverified"
