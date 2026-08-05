"use client";

import { useEffect, useState } from "react";
import { listReputationFlags, resolveFlag, ReputationFlag } from "@/lib/adminApi";

const SEVERITY_COLOR: Record<string, string> = {
  high: "#ef233c",
  medium: "#e0a72b",
  low: "rgba(28,38,33,.5)",
};

export default function AdminFlagsPage() {
  const [flags, setFlags] = useState<ReputationFlag[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    listReputationFlags()
      .then((res) => setFlags(res.flags))
      .catch(() => setError("Could not load flags"));
  }

  useEffect(load, []);

  async function handleResolve(id: number) {
    setBusyId(id);
    try {
      await resolveFlag(id);
      setFlags((fs) => fs?.filter((f) => f.id !== id) ?? null);
    } catch {
      setError("Could not resolve flag");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-error text-[12.5px] font-semibold">{error}</p>;
  if (!flags) return null;
  if (flags.length === 0) return <p className="text-foreground-muted text-sm">No flagged agents.</p>;

  return (
    <div className="rounded bg-surface-2 border border-border divide-y divide-border">
      {flags.map((f) => (
        <div key={f.id} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-[13.5px] text-foreground">{f.agent_name || f.tracent_id}</span>
              <span
                className="px-2 py-0.5 rounded-sm font-semibold text-[11px]"
                style={{ color: SEVERITY_COLOR[f.severity] ?? SEVERITY_COLOR.low }}
              >
                {f.severity}
              </span>
            </div>
            <div className="text-[12px] text-foreground-faint mb-1">{f.flag_type}</div>
            {f.detail && <p className="text-[13px] text-foreground-muted leading-relaxed">{f.detail}</p>}
          </div>
          <div
            onClick={busyId === f.id ? undefined : () => handleResolve(f.id)}
            className="flex-none px-3 py-1.5 rounded font-semibold text-[12px] cursor-pointer text-cyan border border-cyan/35 bg-cyan/10"
          >
            {busyId === f.id ? "…" : "Resolve"}
          </div>
        </div>
      ))}
    </div>
  );
}
