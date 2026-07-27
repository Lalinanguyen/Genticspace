"use client";

import { useEffect, useState } from "react";
import { listAdminReviews, deleteAdminReview, AdminReview } from "@/lib/adminApi";

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<AdminReview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  function load() {
    listAdminReviews()
      .then((res) => setReviews(res.reviews))
      .catch(() => setError("Could not load reviews"));
  }

  useEffect(load, []);

  async function handleDelete(id: number) {
    setBusyId(id);
    try {
      await deleteAdminReview(id);
      setReviews((rs) => rs?.filter((r) => r.id !== id) ?? null);
    } catch {
      setError("Could not delete review");
    } finally {
      setBusyId(null);
    }
  }

  if (error) return <p className="text-error text-[12.5px] font-semibold">{error}</p>;
  if (!reviews) return null;
  if (reviews.length === 0) return <p className="text-foreground-muted text-sm">No reviews yet.</p>;

  return (
    <div className="rounded bg-surface-2 border border-border divide-y divide-border">
      {reviews.map((r) => (
        <div key={r.id} className="flex items-start justify-between gap-4 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-[13.5px] text-foreground">{r.agent_name || r.tracent_id}</span>
              <span className="text-cyan text-[12.5px] font-semibold">{"★".repeat(r.rating)}</span>
            </div>
            <div className="text-[12px] text-foreground-faint mb-1.5">
              {r.author_name || `user #${r.user_id}`} · {new Date(r.created_at).toLocaleDateString()}
            </div>
            {r.text && <p className="text-[13px] text-foreground-muted leading-relaxed">{r.text}</p>}
          </div>
          <div
            onClick={busyId === r.id ? undefined : () => handleDelete(r.id)}
            className="flex-none px-3 py-1.5 rounded font-semibold text-[12px] cursor-pointer text-error border border-error/35 bg-error/10"
          >
            {busyId === r.id ? "…" : "Delete"}
          </div>
        </div>
      ))}
    </div>
  );
}
