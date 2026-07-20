"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { AgentCard } from "@/components/marketplace/AgentCard";
import { useAuth } from "@/lib/auth";
import { getUserProfile, followUser, unfollowUser, ApiError } from "@/lib/api";
import type { UserProfile } from "@/lib/types";

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

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-cyan text-[13px] tracking-tight">
      {"★".repeat(rating)}
      <span className="text-foreground-faint">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

const TABS = ["Contributions", "Favorites", "Reviews", "Companies"] as const;
type Tab = (typeof TABS)[number];

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const userId = Number(id);
  const { user: viewer, token } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<Tab>("Contributions");
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getUserProfile(userId, token || undefined)
      .then(setProfile)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) setNotFound(true);
      });
  }, [userId, token]);

  if (notFound) {
    return (
      <div className="flex flex-col min-h-screen">
        <Nav />
        <main className="flex-1 flex items-center justify-center text-foreground-muted">Profile not found.</main>
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
        await unfollowUser(profile.id, token);
        setProfile({ ...profile, is_following: false, follower_count: (profile.follower_count ?? 1) - 1 });
      } else {
        await followUser(profile.id, token);
        setProfile({ ...profile, is_following: true, follower_count: (profile.follower_count ?? 0) + 1 });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update follow status");
    } finally {
      setFollowBusy(false);
    }
  }

  const connects: { label: string; href: string }[] = [];
  if (profile.website_url) connects.push({ label: "Website", href: profile.website_url });
  if (profile.github_username) connects.push({ label: "GitHub", href: `https://github.com/${profile.github_username}` });
  if (profile.x_handle) connects.push({ label: "X", href: `https://x.com/${profile.x_handle}` });
  if (profile.linkedin_handle) connects.push({ label: "LinkedIn", href: profile.linkedin_handle });
  if (profile.huggingface_handle) connects.push({ label: "Hugging Face", href: `https://huggingface.co/${profile.huggingface_handle}` });
  if (profile.other_link) connects.push({ label: "Other", href: profile.other_link });

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1000px] mx-auto px-[5%] py-12 box-border">
        <div className="flex flex-wrap items-start gap-6 mb-8 pb-8 border-b border-border">
          <div className="w-20 h-20 rounded bg-gradient-to-br from-blue to-blue-to flex items-center justify-center font-display font-bold text-2xl text-white flex-none">
            {initials(profile.name || "?")}
          </div>

          <div className="flex-1 min-w-[240px]">
            <h1 className="font-display font-bold text-[26px] text-foreground mb-1">{profile.name || "Unnamed"}</h1>
            {profile.follower_count !== null && (
              <div className="text-[13px] text-foreground-faint mb-2">
                <span className="font-semibold text-foreground">{profile.follower_count.toLocaleString()}</span> followers
              </div>
            )}
            {profile.is_private ? (
              <p className="text-foreground-muted text-sm">This profile is private.</p>
            ) : (
              profile.bio && <p className="text-foreground-muted text-sm leading-relaxed max-w-[520px]">{profile.bio}</p>
            )}
          </div>

          <div className="flex-none">
            {profile.is_owner ? (
              <Link
                href="/settings"
                className="inline-block px-5 py-2.5 rounded font-semibold text-[13px] bg-[rgba(244,247,243,.06)] border border-border-strong text-foreground no-underline"
              >
                Edit profile
              </Link>
            ) : viewer ? (
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
            ) : null}
          </div>
        </div>

        {error && <p className="text-error text-[12.5px] font-semibold mb-4">{error}</p>}

        {!profile.is_private && (
          <>
            {connects.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-8">
                {connects.map((c) => (
                  <a
                    key={c.label}
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-sm bg-[rgba(244,247,243,.04)] border border-border no-underline font-semibold text-[12.5px] text-foreground hover:border-border-strong transition-colors"
                  >
                    {c.label}
                  </a>
                ))}
              </div>
            )}

            <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
              {TABS.map((t) => (
                <div
                  key={t}
                  onClick={() => setTab(t)}
                  className="px-4 py-2.5 font-semibold text-[13px] cursor-pointer whitespace-nowrap"
                  style={{
                    color: tab === t ? "#F4F7F3" : "rgba(244,247,243,.5)",
                    borderBottom: tab === t ? "2px solid #35C0B0" : "2px solid transparent",
                  }}
                >
                  {t}
                </div>
              ))}
            </div>

            {tab === "Contributions" && (
              (profile.contributions?.length ?? 0) === 0 ? (
                <p className="text-foreground-faint text-sm">No agents listed yet.</p>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                  {profile.contributions!.map((a) => <AgentCard key={a.tracent_id} agent={a} />)}
                </div>
              )
            )}

            {tab === "Favorites" && (
              (profile.favorites?.length ?? 0) === 0 ? (
                <p className="text-foreground-faint text-sm">No agents favorited yet.</p>
              ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
                  {profile.favorites!.map((a) => <AgentCard key={a.tracent_id} agent={a} />)}
                </div>
              )
            )}

            {tab === "Reviews" && (
              (profile.reviews?.length ?? 0) === 0 ? (
                <p className="text-foreground-faint text-sm">No reviews written yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {profile.reviews!.map((r) => (
                    <div key={r.id} className="p-4 rounded bg-surface-2 border border-border">
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <Link href={`/marketplace/${r.tracent_id}`} className="font-semibold text-[13.5px] text-foreground no-underline">
                          {r.agent_name || r.tracent_id}
                        </Link>
                        <Stars rating={r.rating} />
                      </div>
                      {r.text && <p className="text-[12.5px] text-foreground-muted leading-relaxed">{r.text}</p>}
                    </div>
                  ))}
                </div>
              )
            )}

            {tab === "Companies" && (
              (profile.companies_followed?.length ?? 0) === 0 ? (
                <p className="text-foreground-faint text-sm">Not following any companies yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {profile.companies_followed!.map((c) => (
                    <Link
                      key={`${c.source}:${c.name}`}
                      href={`/company/${c.source}/${encodeURIComponent(c.name)}`}
                      className="px-3.5 py-2 rounded-sm bg-[rgba(244,247,243,.04)] border border-border no-underline font-semibold text-[12.5px] text-foreground hover:border-border-strong transition-colors"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
