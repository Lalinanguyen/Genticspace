"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { AgentCard } from "@/components/marketplace/AgentCard";
import { useAuth } from "@/lib/auth";
import { getOrgProfile, followOrg, unfollowOrg, ApiError } from "@/lib/api";
import type { OrgProfile } from "@/lib/types";
import { agentId } from "@/lib/agent";
import { agentColor } from "@/lib/agentColor";

function initials(name: string): string {
  return (
    name
      .split(/[\s_-]+/)
      .filter(Boolean)
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
    <span className="text-cyan-dark text-[13px] tracking-tight">
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
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve().then(() => setLoadFailed(false));
    getOrgProfile(source, org, token || undefined)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else if (attempt < 2) {
          // Transient backend errors (5xx / network) — retry a couple times
          // with backoff before giving up and showing a manual retry.
          setTimeout(() => {
            if (!cancelled) setAttempt((a) => a + 1);
          }, 1200 * (attempt + 1));
        } else {
          setLoadFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [source, org, token, attempt]);

  if (notFound) {
    return (
      <div className="flex flex-col min-h-screen">
        <Nav />
        <main className="flex-1 flex items-center justify-center text-foreground-muted">Company profile not found.</main>
        <Footer />
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="flex flex-col min-h-screen">
        <Nav />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 text-foreground-muted">
          <p>Couldn&apos;t load this profile right now.</p>
          <span
            onClick={() => {
              setLoadFailed(false);
              setAttempt(0);
            }}
            className="glass-chip cursor-pointer px-4 py-2 rounded font-semibold text-[13px] text-foreground"
          >
            Try again
          </span>
        </main>
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

  const color = agentColor(`${profile.source}:${profile.name}`);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background box-border">
        <div className="flex gap-11 items-start flex-wrap px-[5%] pt-12 pb-20 box-border">
          {/* SIDEBAR / IDENTITY */}
          <div className="flex-none w-[260px] min-w-[240px] flex flex-col gap-[22px]">
            <div
              className="w-[88px] h-[88px] rounded flex items-center justify-center font-display font-normal text-[28px] text-white shadow-[0_14px_30px_rgba(28,38,33,.2)]"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
            >
              {initials(profile.name)}
            </div>

            <div>
              <div className="font-display font-normal text-[21px] text-foreground mb-1">{profile.name}</div>
              <div className="font-medium text-[13.5px] font-mono text-foreground-faint">{profile.source}</div>
            </div>

            <div className="flex gap-5">
              <div>
                <div className="font-display font-normal text-[17px] text-foreground">{profile.agent_count}</div>
                <div className="font-medium text-[11.5px] text-foreground-faint">Agents listed</div>
              </div>
              <div>
                <div className="font-display font-normal text-[17px] text-foreground">{formatCount(profile.followers)}</div>
                <div className="font-medium text-[11.5px] text-foreground-faint">Followers</div>
              </div>
              {profile.avg_rating !== null && (
                <div>
                  <div className="font-display font-normal text-[17px] text-foreground">{profile.avg_rating.toFixed(1)}</div>
                  <div className="font-medium text-[11.5px] text-foreground-faint">Avg. rating</div>
                </div>
              )}
            </div>

            {viewer && (
              <div
                onClick={followBusy ? undefined : toggleFollow}
                className="w-full py-[11px] rounded font-semibold text-[13.5px] text-center cursor-pointer"
                style={
                  profile.is_following
                    ? { background: "rgba(28,38,33,.06)", border: "1px solid rgba(28,38,33,.14)", color: "#1C2621" }
                    : { background: "#1C2621", color: "#EEF1EA" }
                }
              >
                {profile.is_following ? "Following" : "Follow"}
              </div>
            )}

            {error && <p className="text-error text-[12.5px] font-semibold">{error}</p>}

            {profile.industry_tags.length > 0 && (
              <>
                <div className="h-px bg-foreground/8" />
                <div>
                  <div className="font-bold text-xs text-foreground-faint uppercase tracking-wide mb-2.5">
                    Specializes in
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {profile.industry_tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1.5 rounded-sm bg-blue-to/14 border border-blue-to/35 font-semibold text-[11.5px] text-blue-to"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* MAIN CONTENT */}
          <div className="flex-1 min-w-[280px]">
            <div className="flex items-center justify-between mb-5">
              <span className="font-display font-normal text-base text-foreground">
                Agents · {profile.agent_count}
              </span>
            </div>
            <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
              {profile.agents.map((a) => (
                <AgentCard key={agentId(a)} agent={a} />
              ))}
            </div>

            {profile.reviews.length > 0 && (
              <>
                <div className="h-px bg-foreground/8 mt-9 mb-7" />
                <div className="flex items-center justify-between mb-5">
                  <span className="font-display font-normal text-base text-foreground">
                    Reviews · {profile.reviews.length}
                  </span>
                  {profile.avg_rating !== null && (
                    <div className="flex items-center gap-1.5">
                      <span className="font-display font-normal text-[15px] text-foreground">
                        {profile.avg_rating.toFixed(1)}
                      </span>
                      <span className="font-medium text-[12.5px] text-foreground-faint">avg. rating</span>
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-3.5">
                  {profile.reviews.map((r) => (
                    <div
                      key={r.id}
                      className="glass-panel p-5 rounded box-border flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded flex-none flex items-center justify-center font-display font-normal text-xs text-white"
                            style={{
                              background: `linear-gradient(135deg, ${agentColor(r.author_name || "anon")}, ${agentColor(r.author_name || "anon")}99)`,
                            }}
                          >
                            {initials(r.author_name || "Anonymous")}
                          </div>
                          <div>
                            <div className="font-semibold text-[13.5px] text-foreground">
                              {r.author_name || "Anonymous"}
                            </div>
                            <Link href={`/marketplace/${agentId(r)}`} className="text-[11.5px] text-foreground-faint hover:text-cyan-dark">
                              on {r.agent_name || agentId(r)}
                            </Link>
                          </div>
                        </div>
                        <Stars rating={r.rating} />
                      </div>
                      {r.text && <p className="text-[13px] leading-relaxed text-foreground-muted">{r.text}</p>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
