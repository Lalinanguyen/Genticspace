import type { Agent, Recommendation } from "@/lib/types";
import { getTrustInfo, TONE_STYLES } from "@/lib/trust";

/**
 * Plain-language trust badge. Never renders the raw `trust_tier` enum or
 * `risk_score` — always goes through `getTrustInfo`, which translates the
 * backend's `trust_summary` field into a label + tone pair.
 */
export function TrustBadge({ agent }: { agent: Pick<Agent | Recommendation, "verified" | "trust_tier" | "trust_summary"> }) {
  const info = getTrustInfo(agent);

  return (
    <span
      title={info.summary}
      className={`px-2.5 py-1 rounded-sm border font-semibold text-[11px] ${TONE_STYLES[info.tone]}`}
    >
      {info.label}
    </span>
  );
}
