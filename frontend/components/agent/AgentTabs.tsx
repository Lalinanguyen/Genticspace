"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DeploymentGuideSection } from "@/components/agent/DeploymentGuideSection";
import { ReviewForm } from "@/components/agent/ReviewForm";
import { listAgentReviews, ApiError } from "@/lib/api";
import type { Agent, Review } from "@/lib/types";

type TabId = "about" | "traction" | "reputation" | "reviews";

const TABS: { id: TabId; label: string }[] = [
  { id: "about", label: "About" },
  { id: "traction", label: "Traction" },
  { id: "reputation", label: "Reputation" },
  { id: "reviews", label: "Reviews" },
];

const SEVERITY_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  high: { color: "#EF233C", bg: "rgba(239,35,60,.08)", border: "rgba(239,35,60,.3)" },
  medium: { color: "#FFC107", bg: "rgba(255,193,7,.08)", border: "rgba(255,193,7,.3)" },
  low: { color: "rgba(28,38,33,.55)", bg: "rgba(28,38,33,.045)", border: "rgba(28,38,33,.14)" },
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-bold text-[12px] text-foreground-faint uppercase tracking-wide mb-3">{children}</div>
  );
}

export function AgentTabs({ agent }: { agent: Agent }) {
  const [tab, setTab] = useState<TabId>("about");

  const categoryTags = [
    ...(agent.interaction_types ?? []),
    ...(agent.industry_tags ?? []),
    ...(agent.sdk_compat ?? []),
  ];

  return (
    <div className="flex flex-col gap-7 min-w-0">
      <div className="flex gap-6 border-b border-border">
        {TABS.map((t) => (
          <div
            key={t.id}
            onClick={() => setTab(t.id)}
            className="pb-3 font-semibold text-[13.5px] cursor-pointer select-none"
            style={{
              color: tab === t.id ? "var(--color-foreground)" : "var(--color-foreground-muted)",
              borderBottom: tab === t.id ? "2px solid var(--color-cyan)" : "2px solid transparent",
            }}
          >
            {t.label}
          </div>
        ))}
        <Link
          href={`/marketplace/${agent.tracent_id}/try`}
          className="pb-3 font-semibold text-[13.5px] text-foreground-muted no-underline hover:text-foreground"
        >
          Sandbox mode
        </Link>
      </div>

      {tab === "about" && (
        <div className="flex flex-col gap-9">
          <div>
            <SectionLabel>About</SectionLabel>
            <p className="m-0 text-[15px] leading-relaxed text-foreground-muted">
              {agent.description || "No description indexed for this agent yet."}
            </p>
          </div>

          {agent.skills && agent.skills.length > 0 && (
            <div>
              <SectionLabel>Skills</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {agent.skills.map((skill, i) => (
                  <span
                    key={skill.skill_id || i}
                    className="px-3 py-1.5 rounded-sm bg-cyan/10 border border-cyan/30 font-semibold text-xs text-cyan"
                  >
                    {skill.skill_name || "Untitled skill"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {categoryTags.length > 0 && (
            <div>
              <SectionLabel>Categories</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {categoryTags.map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-sm bg-cyan/10 border border-cyan/30 font-semibold text-xs text-cyan"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <DeploymentGuideSection tracentId={agent.tracent_id} />
        </div>
      )}

      {tab === "traction" && (
        <div className="py-16 px-5 text-center text-foreground-muted font-medium text-sm border border-dashed border-border rounded">
          Traction metrics (views, follows, deploys over time) aren&apos;t tracked yet for this agent.
        </div>
      )}

      {tab === "reputation" && (
        <div>
          <SectionLabel>Reputation flags</SectionLabel>
          {agent.flags && agent.flags.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              {agent.flags.map((f, i) => {
                const style = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.low;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 p-3.5 rounded"
                    style={{ background: style.bg, border: `1px solid ${style.border}` }}
                  >
                    <span
                      className="flex-none font-bold text-[10px] uppercase tracking-wide pt-0.5"
                      style={{ color: style.color }}
                    >
                      {f.severity}
                    </span>
                    <div>
                      <div className="font-semibold text-[13px] text-foreground mb-0.5">
                        {f.flag_type.replace(/_/g, " ")}
                      </div>
                      {f.detail && (
                        <div className="text-[12.5px] leading-relaxed text-foreground-muted">{f.detail}</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-4.5 px-4 text-center text-[12.5px] text-foreground-faint border border-dashed border-border rounded">
              No reputation flags on record
            </div>
          )}
        </div>
      )}

      {tab === "reviews" && <ReviewsTab agent={agent} />}
    </div>
  );
}

function ReviewsTab({ agent }: { agent: Agent }) {
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [avgRating, setAvgRating] = useState<number | null>(agent.avg_rating ?? null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    listAgentReviews(agent.tracent_id)
      .then((res) => {
        setReviews(res.reviews);
        setAvgRating(res.avg_rating);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load reviews."));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.tracent_id]);

  return (
    <div className="flex flex-col gap-6">
      {avgRating != null && (
        <div className="flex items-center gap-3.5">
          <span className="font-display font-bold text-[28px] text-foreground">{avgRating.toFixed(1)}</span>
          <div>
            <div className="text-sm tracking-wide" style={{ color: "#FFC107" }}>
              {"★".repeat(Math.round(avgRating))}
              {"☆".repeat(5 - Math.round(avgRating))}
            </div>
            <div className="text-[11.5px] text-foreground-muted">{reviews?.length ?? agent.review_count ?? 0} reviews</div>
          </div>
        </div>
      )}

      <ReviewForm tracentId={agent.tracent_id} onSubmitted={load} />

      {error && <p className="text-[13px] text-error">{error}</p>}

      {reviews && reviews.length === 0 && (
        <p className="text-[13px] text-foreground-faint">No reviews yet — be the first.</p>
      )}

      {reviews && reviews.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviews.map((r) => (
            <div key={r.id} className="p-4 rounded bg-surface-2 border border-border">
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-[13px] text-foreground">
                  {r.author_name || "Anonymous"}
                </span>
                <span className="text-[11px] text-foreground-faint">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              <div className="text-xs mb-1.5" style={{ color: "#FFC107" }}>
                {"★".repeat(r.rating)}
                {"☆".repeat(5 - r.rating)}
              </div>
              {r.text && <p className="m-0 text-[13px] leading-relaxed text-foreground-muted">{r.text}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
