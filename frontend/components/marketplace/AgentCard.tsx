import Link from "next/link";
import type { Agent, Recommendation } from "@/lib/types";
import { agentColor } from "@/lib/agentColor";

const MAX_TAGS = 4;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

const TRUST_TIER_LABELS: Record<string, string> = {
  onchain: "On-chain",
  tracent: "Genticspace-verified",
};

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function AgentCard({ agent }: { agent: Agent | Recommendation }) {
  const reasons = "reasons" in agent ? agent.reasons : [];

  const author = agent.provider_org || shortId(agent.owner_address || agent.tracent_id);
  const industry = agent.industry_tags?.[0];
  const byline = industry ? `${author} · ${industry}` : author;

  const allTags = [
    agent.trust_tier ? TRUST_TIER_LABELS[agent.trust_tier] ?? agent.trust_tier : null,
    agent.safe_to_transact ? "Safe to transact" : null,
    agent.a2a_endpoint ? "A2A" : null,
    agent.mcp_endpoint ? "MCP" : null,
    agent.x402_support ? "x402" : null,
    agent.license,
    ...(agent.deployment_types ?? []),
  ].filter((tag): tag is string => !!tag);

  const visibleTags = allTags.slice(0, MAX_TAGS);
  const hiddenCount = allTags.length - visibleTags.length;
  const color = agentColor(agent.tracent_id);
  const label = agent.name || shortId(agent.tracent_id);

  return (
    <Link
      href={`/marketplace/${agent.tracent_id}`}
      className="rounded bg-surface-2 border border-border flex flex-col box-border no-underline hover:border-border-strong transition-colors min-w-0 overflow-hidden"
    >
      <div className="h-[70px] relative flex-none" style={{ background: `linear-gradient(135deg,${color},${color}55)` }}>
        {agent.image_url ? (
          <div
            className="absolute left-3.5 -bottom-[18px] w-[48px] h-[48px] rounded bg-white p-1 box-border"
            style={{ border: "3px solid var(--color-surface-2)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={agent.image_url} alt="" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div
            className="absolute left-3.5 -bottom-[18px] w-[48px] h-[48px] rounded flex items-center justify-center font-display font-bold text-base text-white"
            style={{ border: "3px solid var(--color-surface-2)", background: `linear-gradient(135deg,${color},${color}bb)` }}
          >
            {initials(label)}
          </div>
        )}
      </div>

      <div className="pt-[26px] px-[22px] pb-[22px] flex flex-col gap-3.5 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-display font-bold text-base text-foreground truncate">{label}</span>
            {agent.verified && (
              <span title="Verified" className="text-cyan text-sm flex-none">
                ✓
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-foreground-faint font-mono truncate">{byline}</div>
        </div>

        <p className="text-[13px] leading-relaxed text-foreground-muted m-0 line-clamp-3 break-words">
          {agent.description || "No description indexed for this agent yet."}
        </p>

        {reasons.length > 0 && (
          <div className="flex flex-col gap-1 min-w-0">
            {reasons.map((r) => (
              <span key={r} className="text-[11px] font-medium text-cyan truncate">
                ✦ {r}
              </span>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap">
          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="px-2.5 py-1 rounded-sm bg-cyan/14 border border-cyan/35 font-semibold text-[11px] text-cyan"
            >
              {tag}
            </span>
          ))}
          {hiddenCount > 0 && (
            <span className="px-2.5 py-1 rounded-sm bg-[rgba(28,38,33,.06)] border border-border font-semibold text-[11px] text-foreground-faint">
              +{hiddenCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
