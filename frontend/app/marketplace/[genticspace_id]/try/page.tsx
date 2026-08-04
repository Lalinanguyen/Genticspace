import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { RunConsole } from "@/components/agent/RunConsole";
import { getAgent, getSandboxConfig, listAgents, ApiError } from "@/lib/api";
import { agentId } from "@/lib/agent";
import { agentColor } from "@/lib/agentColor";

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export default async function RunConsolePage({
  params,
}: {
  params: Promise<{ genticspace_id: string }>;
}) {
  const { genticspace_id } = await params;

  let agent;
  try {
    agent = await getAgent(genticspace_id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  // Two independent, real tracks qualify an agent for this page (see
  // RunConsole.tsx): Track A, an embeddable HuggingFace Space
  // (agent.sandboxable/sandbox_url), or Track B, a GitHub repo with a
  // genticspace.yaml manifest (agent_sandbox_config.sandbox_enabled,
  // checked here since it's not part of the agent payload itself). Anything
  // qualifying for neither gets sent back to its own profile page rather
  // than a broken/empty console.
  if (!agent.sandboxable || !agent.sandbox_url) {
    const sandboxConfig = await getSandboxConfig(genticspace_id).catch(() => null);
    if (!sandboxConfig?.sandbox_enabled) {
      redirect(`/marketplace/${genticspace_id}`);
    }
  }

  const { agents: pickerAgents } = await listAgents({ sandboxable_only: true, page_size: 12 });

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background box-border pb-24">
        <div className="flex items-end justify-between gap-4 flex-wrap px-[5%] pt-9 pb-6">
          <div>
            <Link
              href={`/marketplace/${genticspace_id}`}
              className="text-[12.5px] font-semibold text-foreground-faint no-underline"
            >
              ← Back to agent page
            </Link>
            <h1 className="mt-3.5 mb-1.5 font-display font-normal text-[34px] leading-tight text-foreground tracking-[-.4px]">
              Run console
            </h1>
            <p className="text-sm text-foreground-muted">
              Try {agent.name || genticspace_id} on your own task, live, right here.
            </p>
          </div>
        </div>

        {pickerAgents.length > 1 && (
          <div className="px-[5%] pb-6">
            <div className="font-bold text-[11px] text-foreground-faint uppercase tracking-wide mb-2.5">
              Sandboxable agents
            </div>
            <div className="flex gap-3 flex-wrap">
              {pickerAgents.map((a) => {
                const id = agentId(a);
                const active = id === genticspace_id;
                const color = agentColor(id || a.name || "agent");
                const label = a.name || id;
                return (
                  <Link
                    key={id}
                    href={`/marketplace/${id}/try`}
                    className={`flex-1 basis-[220px] min-w-[200px] max-w-[320px] flex items-center gap-3 px-4 py-3.5 rounded no-underline border transition-colors ${
                      active ? "bg-cyan/10 border-cyan/40" : "bg-foreground/3 border-border-strong"
                    }`}
                  >
                    <div
                      className="w-10 h-10 flex-none rounded flex items-center justify-center font-display font-normal text-[13px] text-white"
                      style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
                    >
                      {initials(label)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display font-normal text-[15.5px] text-foreground truncate">{label}</div>
                      <div className="text-[11.5px] text-foreground-faint">
                        {a.industry_tags?.[0] || a.source} · <span className="text-cyan-dark font-semibold">● Live</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="px-[5%]">
          <RunConsole agent={agent} />
        </div>
      </main>
      <Footer />
    </div>
  );
}
