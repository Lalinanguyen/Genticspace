"use client";

import { useEffect, useState } from "react";
import { getAdminStats, AdminStats } from "@/lib/adminApi";

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="p-5 rounded bg-surface-2 border border-border">
      <div className="text-[12.5px] text-foreground-faint mb-1">{label}</div>
      <div className="font-display font-bold text-[26px] text-foreground">{value}</div>
    </div>
  );
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAdminStats()
      .then(setStats)
      .catch(() => setError("Could not load stats"));
  }, []);

  if (error) return <p className="text-error text-[12.5px] font-semibold">{error}</p>;
  if (!stats) return null;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 max-w-[640px]">
      <StatCard label="Total agents" value={stats.total_agents} />
      <StatCard label="Verified" value={stats.verified_count} />
      <StatCard label="Flagged" value={stats.flagged_count} />
    </div>
  );
}
