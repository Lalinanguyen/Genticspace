"use client";

import { useState, useEffect } from "react";
import { listVerificationRequests, reviewVerificationRequest, VerificationRequest } from "@/lib/adminApi";

export default function AdminVerificationsPage() {
  const [requests, setRequests] = useState<VerificationRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    listVerificationRequests()
      .then((res) => setRequests(res.verification_requests))
      .catch(() => setError("Could not load verification requests"));
  }

  useEffect(load, []);

  async function handleReview(tracentId: string, action: "approve" | "reject") {
    setBusyId(tracentId + action);
    try {
      await reviewVerificationRequest(tracentId, action);
      setRequests((rs) => rs?.filter((r) => r.tracent_id !== tracentId) ?? null);
    } catch {
      setError("Could not update verification request");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-error text-[12.5px] font-semibold">{error}</p>;
  if (!requests) return null;
  if (requests.length === 0) return <p className="text-foreground-muted text-sm">No pending verification requests.</p>;

  return (
    <div className="rounded bg-surface-2 border border-border divide-y divide-border">
      {requests.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="font-semibold text-[13.5px] text-foreground mb-1">{r.agent_name || r.tracent_id}</div>
            <div className="text-[12px] text-foreground-faint mb-1">{r.requester_email}</div>
            <div className="text-[11px] text-foreground-faint">
              Submitted {new Date(r.submitted_at).toLocaleDateString()}
            </div>
          </div>
          <div className="flex-none flex gap-2">
            <div
              onClick={busyId ? undefined : () => handleReview(r.tracent_id, "approve")}
              className="px-3 py-1.5 rounded font-semibold text-[12px] cursor-pointer text-cyan border border-cyan/35 bg-cyan/10"
            >
              {busyId === r.tracent_id + "approve" ? "…" : "Approve"}
            </div>
            <div
              onClick={busyId ? undefined : () => handleReview(r.tracent_id, "reject")}
              className="px-3 py-1.5 rounded font-semibold text-[12px] cursor-pointer text-error border border-error/35 bg-error/10"
            >
              {busyId === r.tracent_id + "reject" ? "…" : "Reject"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
