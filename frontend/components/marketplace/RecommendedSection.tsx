"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { getRecommendations, ApiError } from "@/lib/api";
import type { Recommendation } from "@/lib/types";
import { AgentCard } from "./AgentCard";

export function RecommendedSection() {
  const { token, loading } = useAuth();
  const searchParams = useSearchParams();
  const task = searchParams.get("q") || "";

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [fetching, setFetching] = useState(false);

  useEffect(() => {
    if (!token) {
      setRecommendations([]);
      return;
    }
    let cancelled = false;
    setFetching(true);
    getRecommendations(task, token, 3)
      .then((res) => {
        if (!cancelled) setRecommendations(res.recommendations);
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
  }, [token, task]);

  if (loading || !token || (!fetching && recommendations.length === 0)) return null;

  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan flex-none" />
        <span className="font-display font-bold text-sm text-foreground">Recommended for you</span>
      </div>
      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
        {recommendations.map((rec) => (
          <AgentCard key={rec.tracent_id} agent={rec} />
        ))}
      </div>
    </div>
  );
}
