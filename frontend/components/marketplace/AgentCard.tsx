import Link from "next/link";
import type { Agent, Recommendation } from "@/lib/types";
import { AgentAvatar } from "@/components/ui/AgentAvatar";

const MAX_TAGS = 4;

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

  return (
    <Link
      href={`/marketplace/${agent.tracent_id}`}
      className="p-[22px] rounded bg-surface-2 border border-border shadow-[0_10px_28px_rgba(0,0,0,.35)] flex flex-col gap-3.5 box-border no-underline hover:border-border-strong transition-colors min-w-0 overflow-hidden"
    >
      <div className="flex items-start gap-3.5 min-w-0">
        <AgentAvatar imageUrl={agent.image_url} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-display font-bold text-base text-foreground truncate">
              {agent.name || shortId(agent.tracent_id)}
            </span>
            {agent.verified && (
              <span title="Verified" className="text-cyan text-sm flex-none">
                ✓
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-foreground-faint font-mono truncate">{byline}</div>
        </div>
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
          <span className="px-2.5 py-1 rounded-sm bg-[rgba(244,247,243,.06)] border border-border font-semibold text-[11px] text-foreground-faint">
            +{hiddenCount}
          </span>
        )}
      </div>
    </Link>
  );
}
