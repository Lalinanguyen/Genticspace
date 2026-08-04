"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getRecommendations, ApiError } from "@/lib/api";
import type { Recommendation } from "@/lib/types";
import { agentId } from "@/lib/agent";
import { AgentCard } from "./AgentCard";

// Experience level is an internal signal from the user's profile (set once
// at signup), never a manual picker — it just quietly shapes ranking and
// how much hand-holding language shows up in "why this matched" reasons.
export function RecommendedSection({ pageSize }: { pageSize: number }) {
  const { token, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const task = searchParams.get("q") || "";
  const hasQuery = task.trim().length > 0;

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [fetching, setFetching] = useState(false);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    // Without a search query, personalized "recommended for you" only makes
    // sense once we know who "you" are; with a query, it's the actual smart
    // search and works for anyone.
    if (!hasQuery && !token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resets state when auth drops, not a fetch trigger
      setRecommendations([]);
      setFetched(false);
      return;
    }
    let cancelled = false;
    setFetching(true);
    getRecommendations(task, token ?? undefined, hasQuery ? pageSize : 6)
      .then((res) => {
        if (!cancelled) {
          setRecommendations(res.recommendations);
          setFetched(true);
        }
      })
      .catch((err) => {
        if (!cancelled && !(err instanceof ApiError)) throw err;
      })
      .finally(() => {
        if (!cancelled) setFetching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authLoading, token, task, hasQuery, pageSize]);

  if (!hasQuery && !token) return null;
  if (authLoading || (fetching && !fetched)) {
    return hasQuery ? (
      <div className="py-16 text-center text-foreground-faint font-medium text-sm">Searching…</div>
    ) : null;
  }
  if (!fetching && recommendations.length === 0 && !hasQuery) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan flex-none" />
        <span className="font-display font-normal text-sm text-foreground">
          {hasQuery ? `Best matches for "${task}"` : "Recommended for you"}
        </span>
      </div>
      {recommendations.length === 0 ? (
        <div className="py-16 text-center text-foreground-faint font-medium text-sm">
          No agents match that yet. Try a different phrasing or browse with the filters.
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
          {recommendations.map((rec) => (
            <AgentCard key={agentId(rec)} agent={rec} />
          ))}
        </div>
      )}
    </div>
  );
}
