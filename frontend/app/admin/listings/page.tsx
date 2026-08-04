"use client";

import { useEffect, useState } from "react";
import { listAdminListings, unpublishListing, deleteListing, AdminListing } from "@/lib/adminApi";

export default function AdminListingsPage() {
  const [listings, setListings] = useState<AdminListing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    listAdminListings()
      .then((res) => setListings(res.listings))
      .catch(() => setError("Could not load listings"));
  }

  useEffect(load, []);

  async function handleUnpublish(tracentId: string) {
    setBusyId(tracentId + "unpublish");
    try {
      await unpublishListing(tracentId);
      setListings((ls) => ls?.map((l) => (l.tracent_id === tracentId ? { ...l, is_active: false } : l)) ?? null);
    } catch {
      setError("Could not unpublish listing");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(tracentId: string) {
    setBusyId(tracentId + "delete");
    try {
      await deleteListing(tracentId);
      setListings((ls) => ls?.filter((l) => l.tracent_id !== tracentId) ?? null);
    } catch {
      setError("Could not delete listing");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-error text-[12.5px] font-semibold">{error}</p>;
  if (!listings) return null;
  if (listings.length === 0) return <p className="text-foreground-muted text-sm">No self-listed agents.</p>;

  return (
    <div className="rounded bg-surface-2 border border-border divide-y divide-border">
      {listings.map((l) => (
        <div key={l.tracent_id} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-[13.5px] text-foreground">{l.name || l.tracent_id}</span>
              {!l.is_active && (
                <span className="px-2 py-0.5 rounded-sm font-semibold text-[11px] text-foreground-faint border border-border">
                  Unpublished
                </span>
              )}
            </div>
            <div className="text-[12px] text-foreground-faint mb-1">
              {l.submitted_by_email} · risk {l.risk_score.toFixed(2)} · {l.trust_tier || "unverified"}
            </div>
            {l.description && (
              <p className="text-[13px] text-foreground-muted leading-relaxed line-clamp-2">{l.description}</p>
            )}
          </div>
          <div className="flex-none flex gap-2">
            {l.is_active && (
              <div
                onClick={busyId ? undefined : () => handleUnpublish(l.tracent_id)}
                className="px-3 py-1.5 rounded font-semibold text-[12px] cursor-pointer text-foreground-muted border border-border-strong"
              >
                {busyId === l.tracent_id + "unpublish" ? "…" : "Unpublish"}
              </div>
            )}
            <div
              onClick={busyId ? undefined : () => handleDelete(l.tracent_id)}
              className="px-3 py-1.5 rounded font-semibold text-[12px] cursor-pointer text-error border border-error/35 bg-error/10"
            >
              {busyId === l.tracent_id + "delete" ? "…" : "Delete"}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
