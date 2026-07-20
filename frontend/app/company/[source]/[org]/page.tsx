"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { AgentCard } from "@/components/marketplace/AgentCard";
import { useAuth } from "@/lib/auth";
import { getOrgProfile, followOrg, unfollowOrg, ApiError } from "@/lib/api";
import type { OrgProfile } from "@/lib/types";

function initials(name: string): string {
  return (
    name
      .split(/[\s_-]+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);
  return (
    <span className="text-cyan text-[13px] tracking-tight">
      {"★".repeat(rounded)}
      <span className="text-foreground-faint">{"★".repeat(5 - rounded)}</span>
    </span>
  );
}

export default function OrgProfilePage({
  params,
}: {
  params: Promise<{ source: string; org: string }>;
}) {
  const { source, org: orgParam } = use(params);
  const org = decodeURIComponent(orgParam);
  const { user: viewer, token } = useAuth();

  const [profile, setProfile] = useState<OrgProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrgProfile(source, org, token || undefined)
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [source, org, token]);

  if (notFound) {
    return (
      <div className="flex flex-col min-h-screen">
        <Nav />
        <main className="flex-1 flex items-center justify-center text-foreground-muted">Company profile not found.</main>
        <Footer />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col min-h-screen">
        <Nav />
        <main className="flex-1" />
        <Footer />
      </div>
    );
  }

  async function toggleFollow() {
    if (!token || !profile) return;
    setFollowBusy(true);
    setError(null);
    try {
      if (profile.is_following) {
        await unfollowOrg(source, org, token);
        setProfile({ ...profile, is_following: false });
      } else {
        await followOrg(source, org, token);
        setProfile({ ...profile, is_following: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update follow status");
    } finally {
      setFollowBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1000px] mx-auto px-[5%] py-12 box-border">
        <div className="flex flex-wrap items-start gap-6 mb-8 pb-8 border-b border-border">
          <div className="w-20 h-20 rounded bg-gradient-to-br from-blue to-cyan flex items-center justify-center font-display font-bold text-2xl text-white flex-none">
            {initials(profile.name)}
          </div>

          <div className="flex-1 min-w-[240px]">
            <h1 className="font-display font-bold text-[26px] text-foreground mb-1">{profile.name}</h1>
            <div className="flex items-center gap-4 mb-2">
              <div className="text-[13px] text-foreground-faint">
                <span className="font-semibold text-foreground">{profile.agent_count}</span> agents
              </div>
              <div className="text-[13px] text-foreground-faint">
                <span className="font-semibold text-foreground">{formatCount(profile.followers)}</span> followers
              </div>
              {profile.avg_rating !== null && (
                <div className="flex items-center gap-1.5">
                  <Stars rating={profile.avg_rating} />
                  <span className="text-[12px] text-foreground-faint">{profile.avg_rating.toFixed(1)}</span>
                </div>
              )}
            </div>
            {profile.industry_tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {profile.industry_tags.map((tag) => (
                  <span key={tag} className="px-2 py-0.5 rounded-sm bg-blue-to/10 border border-blue-to/30 font-semibold text-[10px] text-blue-to">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {viewer && (
            <div className="flex-none">
              <div
                onClick={followBusy ? undefined : toggleFollow}
                className="inline-block px-5 py-2.5 rounded font-semibold text-[13px] cursor-pointer text-center"
                style={
                  profile.is_following
                    ? { background: "rgba(244,247,243,.06)", border: "1px solid rgba(244,247,243,.14)", color: "#F4F7F3" }
                    : { background: "#F4F7F3", color: "#00171F" }
                }
              >
                {profile.is_following ? "Following" : "Follow"}
              </div>
            </div>
          )}
        </div>

        {error && <p className="text-error text-[12.5px] font-semibold mb-4">{error}</p>}

        <div className="grid gap-8" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
          <div>
            <span className="font-display font-bold text-sm text-foreground block mb-4">Agents</span>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
              {profile.agents.map((a) => <AgentCard key={a.tracent_id} agent={a} />)}
            </div>
          </div>

          {profile.reviews.length > 0 && (
            <div>
              <span className="font-display font-bold text-sm text-foreground block mb-4">Reviews</span>
              <div className="flex flex-col gap-3">
                {profile.reviews.map((r) => (
                  <div key={r.id} className="p-4 rounded bg-surface-2 border border-border">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="font-semibold text-[12.5px] text-foreground">{r.author_name || "Anonymous"}</span>
                      <Stars rating={r.rating} />
                    </div>
                    <Link href={`/marketplace/${r.tracent_id}`} className="text-[11.5px] text-cyan no-underline font-mono">
                      {r.agent_name || r.tracent_id}
                    </Link>
                    {r.text && <p className="text-[12.5px] text-foreground-muted leading-relaxed mt-1.5">{r.text}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
