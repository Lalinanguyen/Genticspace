import Link from "next/link";
import type { Agent, Recommendation } from "@/lib/types";
import { AgentAvatar } from "@/components/ui/AgentAvatar";

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

export function AgentCard({ agent }: { agent: Agent | Recommendation }) {
  const reasons = "reasons" in agent ? agent.reasons : [];

  return (
    <Link
      href={`/marketplace/${agent.tracent_id}`}
      className="p-[22px] rounded bg-surface-2 border border-border shadow-[0_10px_28px_rgba(0,0,0,.35)] flex flex-col gap-3.5 box-border no-underline hover:border-border-strong transition-colors"
    >
      <div className="flex items-start gap-3.5">
        <AgentAvatar imageUrl={agent.image_url} size={48} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold text-base text-foreground">
              {agent.name || shortId(agent.tracent_id)}
            </span>
            {agent.verified && (
              <span title="Verified" className="text-cyan text-sm">
                ✓
              </span>
            )}
          </div>
          <div className="text-[12.5px] text-foreground-faint font-mono">
            {agent.provider_org || shortId(agent.owner_address || agent.tracent_id)}
          </div>
        </div>
      </div>

      <p className="text-[13px] leading-relaxed text-foreground-muted m-0">
        {agent.description || "No description indexed for this agent yet."}
      </p>

      {reasons.length > 0 && (
        <div className="flex flex-col gap-1">
          {reasons.map((r) => (
            <span key={r} className="text-[11px] font-medium text-cyan">
              ✦ {r}
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {agent.trust_tier && (
          <span className="px-2.5 py-1 rounded-sm bg-[rgba(244,247,243,.06)] border border-border font-semibold text-[11px] text-foreground-muted">
            {agent.trust_tier}
          </span>
        )}
        {agent.a2a_endpoint && (
          <span className="px-2.5 py-1 rounded-sm bg-blue-to/14 border border-blue-to/35 font-semibold text-[11px] text-blue-to">
            A2A
          </span>
        )}
        {agent.mcp_endpoint && (
          <span className="px-2.5 py-1 rounded-sm bg-cyan/14 border border-cyan/35 font-semibold text-[11px] text-cyan">
            MCP
          </span>
        )}
        {agent.x402_support && (
          <span className="px-2.5 py-1 rounded-sm bg-[rgba(244,247,243,.06)] border border-border font-semibold text-[11px] text-foreground-muted">
            x402
          </span>
        )}
        {agent.safe_to_transact && (
          <span className="px-2.5 py-1 rounded-sm bg-cyan/14 border border-cyan/35 font-semibold text-[11px] text-cyan">
            Safe to transact
          </span>
        )}
        {agent.license && (
          <span className="px-2.5 py-1 rounded-sm bg-[rgba(244,247,243,.06)] border border-border font-semibold text-[11px] text-foreground-muted">
            {agent.license}
          </span>
        )}
        {agent.deployment_types?.map((dep) => (
          <span key={dep} className="px-2.5 py-1 rounded-sm bg-[rgba(244,247,243,.06)] border border-border font-semibold text-[11px] text-foreground-muted">
            {dep}
          </span>
        ))}
        {agent.industry_tags?.slice(0, 2).map((tag) => (
          <span key={tag} className="px-2.5 py-1 rounded-sm bg-blue-to/10 border border-blue-to/30 font-semibold text-[11px] text-blue-to">
            {tag}
          </span>
        ))}
      </div>
    </Link>
  );
}
