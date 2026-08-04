import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { HomeV3 } from "@/components/landing/HomeV3";
import { CtaBand } from "@/components/landing/CtaBand";
import { listAgents } from "@/lib/api";

const EXAMPLE_QUERY = "customer support";

export default async function LandingPage() {
  // Over-fetch and filter client-side for agents with a real photo -- the
  // marketplace API has no with_photo filter param, so this is done here
  // rather than server-side.
  const matchesRes = await listAgents({ q: EXAMPLE_QUERY, page: 1, page_size: 20 }).catch(() => ({ agents: [] }));
  const matches = matchesRes.agents.filter((a) => !!a.image_url).slice(0, 3);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full bg-background box-border">
        <HomeV3 matches={matches} />
        <CtaBand />
      </main>
      <Footer />
    </div>
  );
}
