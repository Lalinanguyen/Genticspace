"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { useAuth } from "@/lib/auth";
import { getSandboxReadyAgents, getMySandboxTrials, type SandboxTrial } from "@/lib/api";
import type { Agent } from "@/lib/types";
import { PublicSandboxListing } from "@/components/sandbox/PublicSandboxListing";
import { YourSandboxTrials } from "@/components/sandbox/YourSandboxTrials";

export default function SandboxPage() {
  return (
    <Suspense fallback={null}>
      <SandboxPageInner />
    </Suspense>
  );
}

function SandboxPageInner() {
  const { user, token, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const forceBrowse = searchParams.get("browse") === "1";

  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [trials, setTrials] = useState<SandboxTrial[] | null>(null);

  // Signed-in users land on "Your agents" (real sandbox trial history) by
  // default; ?browse=1 (the dashboard's own "+ New trial" link) still shows
  // the full sandbox-ready listing.
  const showDashboard = !!user && !forceBrowse;

  useEffect(() => {
    if (authLoading) return;
    if (user && token && !forceBrowse) {
      getMySandboxTrials(token).then((res) => setTrials(res.trials));
    } else {
      getSandboxReadyAgents().then((res) => setAgents(res.agents));
    }
  }, [authLoading, user, token, forceBrowse]);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background-page box-border px-[5%] pt-12">
        {showDashboard ? (
          trials ? <YourSandboxTrials trials={trials} /> : null
        ) : agents ? (
          <PublicSandboxListing agents={agents} />
        ) : null}
      </main>
      <Footer />
    </div>
  );
}
