import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { FilterBar } from "@/components/marketplace/FilterBar";
import { AgentCard } from "@/components/marketplace/AgentCard";
import { Pagination } from "@/components/marketplace/Pagination";
import { RecommendedSection } from "@/components/marketplace/RecommendedSection";
import { SimilarUseCases } from "@/components/marketplace/SimilarUseCases";
import { TopCompanies } from "@/components/marketplace/TopCompanies";
import { listAgents, getTopProviders } from "@/lib/api";
import { agentId } from "@/lib/agent";

const PAGE_SIZE = 15;

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const industry = typeof params.industry === "string" ? params.industry : undefined;
  const sandboxableOnly = params.sandboxable_only === "true";
  const page = Number(params.page) || 1;

  const hasQuery = q.trim().length > 0;
  const anyFilter = hasQuery || !!industry || sandboxableOnly;

  const filters = {
    q: hasQuery ? q : undefined,
    industry,
    sandboxable_only: sandboxableOnly || undefined,
    page,
    page_size: PAGE_SIZE,
  };

  const [data, topProviders] = await Promise.all([
    hasQuery ? Promise.resolve(null) : listAgents(filters),
    anyFilter ? Promise.resolve(null) : getTopProviders(),
  ]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background box-border">
        <div className="px-[5%] pt-11 pb-6 box-border">
          <h1 className="font-display font-normal text-[34px] leading-tight text-foreground tracking-[-.4px] mb-2">
            What do you need done?
          </h1>
          <p className="mb-[22px] text-[15px] text-foreground-muted">
            Browse agents by the job, in plain English. No engineering background required.
          </p>
          <SearchBar />
        </div>

        <FilterBar />

        {topProviders && (
          <div className="px-[5%] pt-6 box-border">
            <TopCompanies providers={topProviders.providers} />
          </div>
        )}

        <div className="px-[5%] pt-2 pb-20 box-border">
          {hasQuery ? (
            <>
              <SimilarUseCases query={q} />
              <RecommendedSection pageSize={PAGE_SIZE} />
            </>
          ) : (
            <>
              <span className="block mb-5 font-display font-normal text-xl text-foreground">
                {industry ? "Most popular" : `${data?.total.toLocaleString() ?? 0} agents`}
              </span>
              {data && data.agents.length === 0 ? (
                <div className="py-16 px-5 text-center text-foreground-muted font-medium text-sm">
                  No agents match your filters yet. Try clearing them.
                </div>
              ) : (
                <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(290px, 1fr))" }}>
                  {data?.agents.map((agent) => <AgentCard key={agentId(agent)} agent={agent} />)}
                </div>
              )}
              {data && <Pagination page={data.page} totalPages={totalPages} />}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
