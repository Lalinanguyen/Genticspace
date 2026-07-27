"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { submitAgentReview, ApiError } from "@/lib/api";

export function ReviewForm({ tracentId, onSubmitted }: { tracentId: string; onSubmitted: () => void }) {
  const { user, token } = useAuth();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !token) {
    return <p className="text-[13px] text-foreground-muted">Log in to leave a review.</p>;
  }

  async function submit() {
    if (!rating || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitAgentReview(tracentId, rating, text.trim() || undefined, token!);
      setText("");
      setRating(0);
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit your review.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 rounded bg-surface-2 border border-border box-border flex flex-col gap-3">
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            onClick={() => setRating(n)}
            onMouseEnter={() => setHoverRating(n)}
            onMouseLeave={() => setHoverRating(0)}
            className="cursor-pointer text-xl leading-none"
            style={{ color: n <= (hoverRating || rating) ? "#FFC107" : "rgba(28,38,33,.2)" }}
          >
            ★
          </span>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share your experience with this agent (optional)"
        className="w-full min-h-[70px] box-border p-2.5 rounded-sm bg-surface border border-border text-foreground text-[13px] resize-y focus:outline-none focus:border-cyan"
      />
      {error && <p className="text-[12.5px] text-error">{error}</p>}
      <div
        onClick={rating && !submitting ? submit : undefined}
        className="self-start px-4 py-2 rounded-sm font-semibold text-[12.5px]"
        style={{
          background: rating && !submitting ? "#1C2621" : "rgba(28,38,33,.08)",
          color: rating && !submitting ? "#EEF1EA" : "rgba(28,38,33,.4)",
          cursor: rating && !submitting ? "pointer" : "default",
        }}
      >
        {submitting ? "Submitting..." : "Submit review"}
      </div>
    </div>
  );
}
