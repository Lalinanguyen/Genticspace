import Link from "next/link";
import type { Agent, Recommendation } from "@/lib/types";
import { agentId } from "@/lib/agent";
import { agentColor } from "@/lib/agentColor";
import { TrustBadge } from "@/components/agent/TrustBadge";

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AgentCard({ agent }: { agent: Agent | Recommendation }) {
  const id = agentId(agent);
  const color = agentColor(id || agent.name || "agent");
  const label = agent.name || id;
  const industry = agent.industry_tags?.[0];
  const tags = [agent.license, ...(agent.deployment_types ?? [])].filter((t): t is string => !!t);

  return (
    <Link
      href={`/marketplace/${id}`}
      className="glass-panel rounded overflow-hidden flex flex-col no-underline hover:border-white transition-colors"
    >
      <div className="relative h-28" style={{ background: `linear-gradient(135deg, ${color}, ${color}55)` }}>
        {agent.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agent.image_url}
            alt=""
            className="absolute left-4 -bottom-[22px] w-[52px] h-[52px] rounded border-[3px] border-background object-cover"
          />
        ) : (
          <div
            className="absolute left-4 -bottom-[22px] w-[52px] h-[52px] rounded border-[3px] border-background flex items-center justify-center font-display font-normal text-base text-white"
            style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
          >
            {initials(label)}
          </div>
        )}
      </div>
      <div className="pt-[30px] pb-4 px-4 flex flex-col gap-2 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-display font-normal text-base text-foreground">{label}</span>
          {agent.verified && (
            <span
              title="Verified"
              className="w-[17px] h-[17px] rounded-sm flex-none flex items-center justify-center bg-cyan text-background text-[10px] leading-none"
            >
              ✓
            </span>
          )}
        </div>
        <div className="text-xs text-foreground-faint">
          by {agent.provider_org || agent.source}
          {industry ? ` · ${industry}` : ""}
        </div>
        <p className="text-[13px] leading-relaxed text-foreground/65 mt-0.5 line-clamp-2">
          {agent.description || "No description indexed for this agent yet."}
        </p>
        <div className="flex gap-1.5 flex-wrap mt-auto pt-1.5">
          <TrustBadge agent={agent} />
          {agent.sandboxable && (
            <span
              title="Try this agent live, right now, no setup"
              className="px-2.5 py-1 rounded-sm font-semibold text-[11px] bg-cyan/14 border border-cyan/35 text-cyan"
            >
              ▶ Try it
            </span>
          )}
          {tags.map((tag) => (
            <span key={tag} className="px-2.5 py-1 rounded bg-foreground/6 font-semibold text-[11px] text-foreground/70">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
