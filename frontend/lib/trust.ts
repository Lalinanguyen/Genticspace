import type { Agent } from "./types";

export type TrustTone = "verified" | "tracent_verified" | "tracent_hosted" | "caution" | "unknown";

export interface TrustInfo {
  /** Short badge text, e.g. "Verified". */
  label: string;
  tone: TrustTone;
  /** One-line, plain-English summary — used as the badge's tooltip/title. */
  summary: string;
  /** Extra plain-English bullets — used on the agent detail page if needed. */
  details: string[];
}

/**
 * `trust_summary` is the single authoritative, presentation-ready trust
 * label — computed server-side by app/services/trust_summary.py from an
 * exhaustive 5-value set (`tracent_verified` / `tracent_hosted` / `verified`
 * / `flagged` / `unverified`). These are backend-internal tokens, distinct
 * from "Genticspace" the product's user-facing brand (see that module's
 * docstring). Per that module's docstring: "This is a presentation-layer
 * contract: frontend code renders these labels directly to non-technical
 * end users with no further interpretation." So this map is a translation
 * layer only (enum -> plain English + badge tone), not a competing
 * judgement call — it must not disagree with the backend's precedence
 * (tracent tier beats tracent-hosted beats a high-severity flag beats
 * on-chain-verified beats unverified; see compute_trust_summary).
 *
 * Never render `trust_tier` or `risk_score` directly to end users — always
 * go through `getTrustInfo`.
 */
const TRUST_SUMMARY_LABELS: Record<string, TrustInfo> = {
  tracent_verified: {
    label: "Genticspace Verified",
    tone: "tracent_verified",
    summary: "Manually reviewed and approved by the Genticspace team.",
    details: [
      "A person on the Genticspace team manually reviewed and approved this agent, the highest level of confidence available.",
    ],
  },
  tracent_hosted: {
    label: "Genticspace Hosted",
    tone: "tracent_hosted",
    summary: "Genticspace wrote and runs this agent itself.",
    details: [
      "Genticspace wrote and operates this agent itself, rather than just discovering or reviewing someone else's.",
      "That's a different guarantee than Genticspace Verified: this isn't a human review of a third-party agent, it's a first-party one.",
    ],
  },
  verified: {
    label: "Verified",
    tone: "verified",
    summary: "Automatically verified: it exists on-chain and its endpoints are live.",
    details: [
      "This agent was automatically verified: it exists on the on-chain registry, its endpoints responded, and it hasn't changed owners.",
      "No person has reviewed it, this is an automated check, not a human one.",
    ],
  },
  flagged: {
    label: "Proceed With Caution",
    tone: "caution",
    summary: "This agent has changed owners recently, proceed carefully.",
    details: [
      "This agent has changed owners recently, proceed carefully.",
      "That can be a sign of a flipped or abandoned listing, even if other checks passed.",
    ],
  },
  unverified: {
    label: "Not Yet Verified",
    tone: "unknown",
    summary: "Not yet verified, use your own judgement.",
    details: [
      "This agent hasn't gone through Genticspace's verification yet.",
      "That doesn't necessarily mean something is wrong, just that nothing has been checked.",
    ],
  },
};

/**
 * Fallback only, for the (believed unlikely) case `trust_summary` is missing
 * from a response — e.g. an older/rolled-back backend deploy, or a
 * hand-built object in a test. Deliberately mirrors
 * app/services/trust_summary.py's precedence so this never disagrees with
 * what the backend would have said. The frontend's `Agent` type has no
 * `flags`/severity data, so this can only fall as far as "verified" /
 * "unverified" — it can never independently produce "flagged".
 */
export function deriveTrustInfo(agent: Pick<Agent, "verified" | "trust_tier">): TrustInfo {
  if (agent.trust_tier === "tracent") return TRUST_SUMMARY_LABELS.tracent_verified;
  if (agent.trust_tier === "tracent-hosted") return TRUST_SUMMARY_LABELS.tracent_hosted;
  if (agent.verified && agent.trust_tier === "onchain") return TRUST_SUMMARY_LABELS.verified;
  return TRUST_SUMMARY_LABELS.unverified;
}

/**
 * Preferred entry point. Reads `agent.trust_summary` (present on every agent
 * object returned by GET /public/agents, /public/agents/{id}, /agents,
 * /agents/{id}, and /trust/{id}) and translates it to plain English via
 * TRUST_SUMMARY_LABELS. Falls back to `deriveTrustInfo` only if the field is
 * missing or isn't one of the five documented values — kept as a defensive
 * path, not because it's expected to trigger in practice.
 */
export function getTrustInfo(agent: Pick<Agent, "verified" | "trust_tier" | "trust_summary">): TrustInfo {
  const raw = agent.trust_summary;
  if (typeof raw === "string" && TRUST_SUMMARY_LABELS[raw]) {
    return TRUST_SUMMARY_LABELS[raw];
  }
  // Missing, or present but not one of the five documented tokens — never
  // show an unrecognized raw value to the user; derive instead.
  return deriveTrustInfo(agent);
}

/**
 * Tailwind classes per tone, following this app's existing "chip" look
 * (translucent tint background + matching border + solid text, see the
 * tag chips in components/marketplace/AgentCard.tsx) rather than introducing
 * a new visual style.
 */
export const TONE_STYLES: Record<TrustTone, string> = {
  tracent_verified: "bg-emerald-500/12 border-emerald-500/35 text-emerald-400",
  tracent_hosted: "bg-violet-500/12 border-violet-500/35 text-violet-400",
  verified: "bg-cyan/14 border-cyan/35 text-cyan",
  caution: "bg-amber-500/12 border-amber-500/35 text-amber-400",
  unknown: "bg-surface border-border text-foreground-faint",
};
