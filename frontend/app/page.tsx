import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { HomeV3 } from "@/components/landing/HomeV3";
import { CtaBand } from "@/components/landing/CtaBand";
import { listAgents } from "@/lib/api";

const EXAMPLE_QUERY = "customer support";

export default async function LandingPage() {
  const matchesRes = await listAgents({ q: EXAMPLE_QUERY, page: 1, page_size: 3 }).catch(() => ({ agents: [] }));

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full bg-background box-border">
        <HomeV3 matches={matchesRes.agents} />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
