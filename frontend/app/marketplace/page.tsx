import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { FilterSidebar } from "@/components/marketplace/FilterSidebar";
import { AgentCard } from "@/components/marketplace/AgentCard";
import { Pagination } from "@/components/marketplace/Pagination";
import { RecommendedSection } from "@/components/marketplace/RecommendedSection";
import { TopCompanies } from "@/components/marketplace/TopCompanies";
import { listAgents, getTopProviders } from "@/lib/api";

const PAGE_SIZE = 15;

function parseBool(value: string | string[] | undefined): boolean {
  return value === "true";
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : undefined;
  const trust_tier = typeof params.trust_tier === "string" ? params.trust_tier : undefined;
  const page = Number(params.page) || 1;

  const filters = {
    q,
    verified: parseBool(params.verified) ? true : undefined,
    trust_tier,
    a2a_only: parseBool(params.a2a_only),
    mcp_only: parseBool(params.mcp_only),
    x402_only: parseBool(params.x402_only),
    safe_only: parseBool(params.safe_only),
    industry: typeof params.industry === "string" ? params.industry : undefined,
    license: typeof params.license === "string" ? params.license : undefined,
    deployment: typeof params.deployment === "string" ? params.deployment : undefined,
    page,
    page_size: PAGE_SIZE,
  };

  const hasQuery = !!q && q.trim().length > 0;

  // With a search query, results come from the smart-ranked recommendations
  // (RecommendedSection) instead of this plain filtered grid, so skip the
  // now-unused fetch rather than paying for a query whose result is discarded.
  const [data, topProviders] = await Promise.all([
    hasQuery
      ? Promise.resolve({ total: 0, page: 1, page_size: PAGE_SIZE, agents: [] })
      : listAgents(filters),
    getTopProviders(),
  ]);
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background box-border">
        <div className="relative px-[5%] pt-12 pb-8 overflow-hidden box-border">
          <div
            className="absolute -top-40 right-[10%] w-[420px] h-[420px] glow-blob-static"
            style={{ background: "radial-gradient(circle, rgba(7,42,200,.4), transparent 70%)" }}
          />
          <div className="relative max-w-[720px]">
            <h1 className="font-display font-bold text-4xl leading-tight text-foreground tracking-tight mb-2.5">
              Marketplace
            </h1>
            <p className="text-foreground-muted text-[15px] leading-relaxed mb-6.5">
              Search by task, trust tier or protocol support. Every listing pulls straight from
              the on-chain registry.
            </p>
            <SearchBar />
          </div>
        </div>

        <TopCompanies providers={topProviders.providers} />

        <div className="flex gap-9 items-start px-[5%] pb-20 box-border flex-wrap">
          <FilterSidebar />

          <div className="flex-1 min-w-[280px]">
            <RecommendedSection pageSize={PAGE_SIZE} />

            {!hasQuery && (
              <>
                <div className="flex items-center justify-between flex-wrap gap-3 mb-5.5">
                  <span className="font-semibold text-lg text-cyan">
                    {data.total.toLocaleString()} agent{data.total === 1 ? "" : "s"}
                  </span>
                </div>

                {data.agents.length === 0 ? (
                  <div className="py-16 px-5 text-center text-foreground-muted font-medium text-sm">
                    No agents match your filters yet. Try resetting them.
                  </div>
                ) : (
                  <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                    {data.agents.map((agent) => (
                      <AgentCard key={agent.tracent_id} agent={agent} />
                    ))}
                  </div>
                )}

                <Pagination page={data.page} totalPages={totalPages} />
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
