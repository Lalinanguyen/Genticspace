import { notFound } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { RunConsole } from "@/components/agent/RunConsole";
import { getAgent, ApiError } from "@/lib/api";

export default async function TryAgentPage({
  params,
}: {
  params: Promise<{ tracent_id: string }>;
}) {
  const { tracent_id } = await params;

  let agent;
  try {
    agent = await getAgent(tracent_id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full bg-background-page box-border">
        <RunConsole agent={agent} />
      </main>
      <Footer />
    </div>
  );
}
