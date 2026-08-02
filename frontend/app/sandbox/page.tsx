import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { AgentCard } from "@/components/marketplace/AgentCard";
import { getSandboxReadyAgents } from "@/lib/api";

export default async function SandboxPage() {
  const { agents } = await getSandboxReadyAgents();

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background-page box-border">
        <div className="relative px-[5%] pt-12 pb-8 overflow-hidden box-border">
          <div
            className="absolute -top-40 right-[10%] w-[420px] h-[420px] glow-blob-static"
            style={{ background: "radial-gradient(circle, rgba(7,42,200,.4), transparent 70%)" }}
          />
          <div className="relative max-w-[720px]">
            <h1 className="font-display font-bold text-4xl leading-tight text-foreground tracking-tight mb-2.5 flex items-center gap-3">
              Sandbox mode
              <span className="px-2 py-0.5 rounded-sm font-bold text-[11px] tracking-[1px] text-white align-middle" style={{ background: "#178C7E" }}>
                BETA
              </span>
            </h1>
            <p className="text-foreground-muted text-[15px] leading-relaxed mb-2">
              Run an agent&apos;s real open-source code in an isolated environment before you adopt it.
            </p>
            <p className="text-foreground-faint text-[13px] leading-relaxed">
              Agents show up here once they have a <code>genticspace.yaml</code> manifest, or a real README the
              sandbox agent can install from.
            </p>
          </div>
        </div>

        <div className="px-[5%] pb-20 box-border">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5.5">
            <span className="font-semibold text-lg text-cyan">
              {agents.length.toLocaleString()} sandbox-ready agent{agents.length === 1 ? "" : "s"}
            </span>
          </div>

          {agents.length === 0 ? (
            <div className="py-16 px-5 text-center text-foreground-muted font-medium text-sm">
              No agents are sandbox-ready yet. Agent authors can enable this by adding a{" "}
              <code>genticspace.yaml</code>{" "}manifest, or simply by having a real README in their repo.
            </div>
          ) : (
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
              {agents.map((agent) => (
                <AgentCard key={agent.tracent_id} agent={agent} />
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
