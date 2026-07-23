import Link from "next/link";
import { listAgents } from "@/lib/api";
import type { Agent } from "@/lib/types";
import { agentId } from "@/lib/agent";
import { agentColor } from "@/lib/agentColor";
import { SpotlightRail, Swoosh } from "./SpotlightRail";

const EXAMPLE_QUERY = "customer support";

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function SearchScene({ agents }: { agents: Agent[] }) {
  return (
    <div className="flex gap-14 items-start flex-wrap">
      <div className="flex-1 basis-[340px] min-w-[300px] max-w-[460px]">
        <span className="font-mono font-semibold text-xs tracking-[1.5px] text-cyan-dark">SEARCH</span>
        <h2 className="font-display font-normal text-[44px] leading-[1.08] text-foreground tracking-[-.6px] mt-[18px] mb-[22px] text-balance">
          Search for your tool in plain English
        </h2>
        <p className="text-[16.5px] leading-relaxed text-foreground/65">
          Describe the job, &quot;triage my support inbox&quot;, &quot;reconcile invoices&quot;, and
          Genticspace matches agents by capability, not keyword. No engineering brief required.
        </p>
      </div>
      <div className="glass-panel-lg flex-1 basis-[420px] min-w-[320px] p-[26px] rounded-lg box-border">
        <div className="glass-chip flex items-center gap-3 px-[18px] py-[13px] rounded mb-[22px]">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(28,38,33,.5)" strokeWidth="2" strokeLinecap="round" className="flex-none">
            <circle cx="10" cy="10" r="5.5" />
            <path d="M14.5 14.5L20 20" />
          </svg>
          <span className="flex-1 min-w-0 text-sm text-foreground whitespace-nowrap overflow-hidden">
            &quot;{EXAMPLE_QUERY}&quot;
          </span>
          <span className="font-bold text-[12.5px] text-[#08302B] bg-cyan px-4 py-2 rounded flex-none">
            Search
          </span>
        </div>
        <div className="font-mono font-semibold text-[10px] tracking-[1.5px] text-foreground-faint mb-2.5 text-center">
          TOP MATCHES
        </div>
        <div className="flex flex-col gap-1.5">
          {agents.length === 0 && (
            <p className="text-xs text-foreground-faint text-center py-4">No live matches right now.</p>
          )}
          {agents.map((agent) => {
            const id = agentId(agent);
            const color = agentColor(id || agent.name || "agent");
            const label = agent.name || id;
            return (
              <Link
                key={id}
                href={`/marketplace/${id}`}
                className="glass-chip flex items-center gap-2.5 px-3 py-2.5 rounded hover:bg-cyan/8 transition-colors"
              >
                <span
                  className="w-[26px] h-[26px] rounded flex-none flex items-center justify-center font-display font-normal text-[10px] text-white"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
                >
                  {initials(label)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="font-display font-normal text-[13.5px] text-foreground">{label}</span>
                  {agent.industry_tags?.[0] && (
                    <span className="text-[11px] text-foreground-faint"> · {agent.industry_tags[0]}</span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MarketplaceScene({ agents }: { agents: Agent[] }) {
  return (
    <div className="flex gap-14 items-start flex-wrap">
      <div className="flex-1 basis-[340px] min-w-[300px] max-w-[460px]">
        <span className="font-mono font-semibold text-xs tracking-[1.5px] text-cyan-dark">MARKETPLACE</span>
        <h2 className="font-display font-normal text-[40px] leading-[1.1] text-foreground tracking-[-.5px] mt-[18px] mb-[22px] text-balance">
          Browse what teams are actually listing
        </h2>
        <p className="text-[16.5px] leading-relaxed text-foreground/65">
          Every listing shows its license, deployment options and verification status up front,
          nothing buried.
        </p>
      </div>
      <div className="flex-1 basis-[420px] min-w-[320px] flex gap-4 flex-wrap">
        {agents.map((agent) => {
          const id = agentId(agent);
          const color = agentColor(id || agent.name || "agent");
          const label = agent.name || id;
          return (
            <Link
              key={id}
              href={`/marketplace/${id}`}
              className="glass-panel-lg flex-1 basis-[190px] rounded-lg overflow-hidden hover:border-white transition-colors"
            >
              <div className="h-[70px] relative" style={{ background: `linear-gradient(135deg, ${color}, ${color}55)` }}>
                <div
                  className="absolute left-3.5 -bottom-[18px] w-[42px] h-[42px] rounded border-[3px] border-background flex items-center justify-center font-display font-normal text-[13px] text-white"
                  style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
                >
                  {initials(label)}
                </div>
              </div>
              <div className="pt-[26px] pb-3.5 px-3.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-display font-normal text-[15px] text-foreground">{label}</span>
                  {agent.verified && (
                    <span className="w-[15px] h-[15px] rounded-sm flex-none flex items-center justify-center bg-cyan text-[#08302B] text-[9px] leading-none">
                      ✓
                    </span>
                  )}
                </div>
                <div className="text-[11.5px] text-foreground-faint">
                  {agent.industry_tags?.[0] || agent.source}
                  {agent.provider_org ? ` · ${agent.provider_org}` : ""}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function DeploymentScene({ sandboxableCount }: { sandboxableCount: number }) {
  return (
    <div className="flex gap-14 items-start flex-wrap">
      <div className="flex-1 basis-[340px] min-w-[300px] max-w-[460px]">
        <span className="font-mono font-semibold text-xs tracking-[1.5px] text-cyan-dark">DEPLOYMENT</span>
        <h2 className="font-display font-normal text-[40px] leading-[1.1] text-foreground tracking-[-.5px] mt-[18px] mb-[22px] text-balance">
          Try it live, then deploy with confidence
        </h2>
        <p className="text-[16.5px] leading-relaxed text-foreground/65">
          Sandboxable agents run in a real embedded environment, right on the listing, no setup
          required. When you&apos;re ready, an AI-generated deployment guide walks you through
          getting it running on your own stack.
        </p>
      </div>
      <div className="glass-panel-lg flex-1 basis-[420px] min-w-[320px] p-[26px] rounded-lg box-border flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3.5 flex-wrap">
          <div className="font-semibold text-base text-foreground max-w-[280px]">
            Sandbox Mode: try an agent before you commit
          </div>
          <span className="px-[11px] py-[5px] rounded font-mono font-semibold text-[11px] text-cyan-dark bg-cyan/12 border border-cyan/35 flex-none">
            {sandboxableCount > 0 ? `${sandboxableCount} live now` : "expanding soon"}
          </span>
        </div>
        <p className="text-[13.5px] leading-relaxed text-foreground-muted">
          Open any sandboxable listing to run the real thing directly in your browser, no install,
          no signup for the embed itself.
        </p>
        <div className="border-t border-border pt-4">
          <div className="font-semibold text-base text-foreground mb-1.5">Deployment guide, generated for you</div>
          <p className="text-[13.5px] leading-relaxed text-foreground-muted">
            Every listing can generate install and usage steps tailored to your experience level,
            grounded only in what the agent&apos;s own README or site actually documents.
          </p>
        </div>
        <Link
          href="/marketplace?sandboxable_only=true"
          className="self-start mt-1 font-bold text-sm text-background bg-foreground px-5 py-2.5 rounded"
        >
          Browse sandboxable agents
        </Link>
      </div>
    </div>
  );
}

export async function NewReleaseSpotlight() {
  const [searchRes, marketRes, sandboxRes] = await Promise.all([
    listAgents({ q: EXAMPLE_QUERY, page: 1, page_size: 3 }).catch(() => ({ agents: [] })),
    listAgents({ page: 3, page_size: 4 }).catch(() => ({ agents: [] })),
    listAgents({ sandboxable_only: true, page: 1, page_size: 1 }).catch(() => ({ total: 0 })),
  ]);

  if (searchRes.agents.length === 0 && marketRes.agents.length === 0) return null;

  return (
    <div className="w-full bg-background">
      <div className="max-w-[1440px] mx-auto px-[5%] py-[88px] box-border relative">
        <Swoosh style={{ right: "5%", top: 36, transform: "scaleX(-1)" }} />
        <Swoosh style={{ right: "5%", bottom: 34, transform: "scale(-1,-1)" }} />
        <SpotlightRail
          sections={[
            { id: "spotlight-search", label: "Search", content: <SearchScene agents={searchRes.agents} /> },
            { id: "spotlight-marketplace", label: "Marketplace", content: <MarketplaceScene agents={marketRes.agents} /> },
            {
              id: "spotlight-deployment",
              label: "Deployment",
              content: <DeploymentScene sandboxableCount={sandboxRes.total ?? 0} />,
            },
          ]}
        />
      </div>
    </div>
  );
}
