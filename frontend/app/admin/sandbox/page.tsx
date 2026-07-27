"use client";

import { useEffect, useState } from "react";
import { listSandboxCohort, disableSandboxEntry, SandboxCohortEntry } from "@/lib/adminApi";

export default function AdminSandboxPage() {
  const [entries, setEntries] = useState<SandboxCohortEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    listSandboxCohort()
      .then((res) => setEntries(res.sandbox_cohort))
      .catch(() => setError("Could not load sandbox cohort"));
  }

  useEffect(load, []);

  async function handleDisable(tracentId: string) {
    setBusyId(tracentId);
    try {
      await disableSandboxEntry(tracentId);
      setEntries((es) => es?.map((e) => (e.tracent_id === tracentId ? { ...e, status: "disabled" } : e)) ?? null);
    } catch {
      setError("Could not disable sandbox for this agent");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-error text-[12.5px] font-semibold">{error}</p>;
  if (!entries) return null;
  if (entries.length === 0) return <p className="text-foreground-muted text-sm">No sandbox-ready agents yet.</p>;

  return (
    <div className="rounded bg-surface-2 border border-border divide-y divide-border">
      {entries.map((e) => (
        <div key={e.tracent_id} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="font-semibold text-[13.5px] text-foreground mb-1">{e.agent_name || e.tracent_id}</div>
            <div className="text-[12px] text-foreground-faint mb-1">
              status: {e.status}
              {e.admitted_by ? ` · admin action by ${e.admitted_by}` : " · sandbox-ready via its own manifest"}
            </div>
            {e.admitted_at && (
              <div className="text-[11px] text-foreground-faint">
                {new Date(e.admitted_at).toLocaleDateString()}
              </div>
            )}
          </div>
          <div className="flex-none">
            {e.status !== "disabled" ? (
              <div
                onClick={busyId ? undefined : () => handleDisable(e.tracent_id)}
                className="px-3 py-1.5 rounded font-semibold text-[12px] cursor-pointer text-error border border-error/35 bg-error/10"
              >
                {busyId === e.tracent_id ? "…" : "Disable"}
              </div>
            ) : (
              <span className="px-3 py-1.5 rounded font-semibold text-[12px] text-foreground-faint border border-border">
                Disabled
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
