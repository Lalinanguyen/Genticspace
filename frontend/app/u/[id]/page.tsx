"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { AgentCard } from "@/components/marketplace/AgentCard";
import { useAuth } from "@/lib/auth";
import { getUserProfile, followUser, unfollowUser, ApiError } from "@/lib/api";
import type { UserProfile } from "@/lib/types";
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

function formatMonth(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="text-cyan-dark text-[13px] tracking-tight">
      {"★".repeat(rating)}
      <span className="text-foreground-faint">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

const TAB_ICONS: Record<Tab, React.ReactNode> = {
  Contributions: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  Favorites: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="m12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.2L12 17l-5.6 3 1.4-6.2-4.8-4.3 6.4-.6Z" />
    </svg>
  ),
  Companies: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <rect x="4" y="3" width="10" height="18" />
      <rect x="14" y="8" width="6" height="13" />
      <line x1="7" y1="7" x2="7" y2="7.01" />
      <line x1="10" y1="7" x2="10" y2="7.01" />
      <line x1="7" y1="11" x2="7" y2="11.01" />
      <line x1="10" y1="11" x2="10" y2="11.01" />
    </svg>
  ),
  Reviews: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  ),
};

const TABS = ["Contributions", "Favorites", "Companies", "Reviews"] as const;
type Tab = (typeof TABS)[number];

function SocialIcon({ src, invert }: { src: string; invert?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="w-3.5 h-3.5 object-contain"
      style={invert ? { filter: "brightness(0)" } : undefined}
    />
  );
}

function GlobeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" className="text-foreground-faint flex-none">
      <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 12h17M12 3.5c2.2 2.3 3.4 5.3 3.4 8.5s-1.2 6.2-3.4 8.5c-2.2-2.3-3.4-5.3-3.4-8.5S9.8 5.8 12 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export default function UserProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const userId = Number(id);
  const { user: viewer, token } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("Contributions");
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadFailed(false);
    getUserProfile(userId, token || undefined)
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setNotFound(true);
        } else if (attempt < 2) {
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
  }, [userId, token, attempt]);

  if (notFound) {
    return (
      <div className="flex flex-col min-h-screen">
        <Nav />
        <main className="flex-1 flex items-center justify-center text-foreground-muted">Profile not found.</main>
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

  const connects: { label: string; href: string; icon: React.ReactNode }[] = [];
  if (profile.website_url) connects.push({ label: profile.website_url.replace(/^https?:\/\//, ""), href: profile.website_url, icon: <GlobeIcon /> });
  if (profile.github_username)
    connects.push({ label: profile.github_username, href: `https://github.com/${profile.github_username}`, icon: <SocialIcon src="/assets/github-mark.png" invert /> });
  if (profile.x_handle) connects.push({ label: `@${profile.x_handle}`, href: `https://x.com/${profile.x_handle}`, icon: <SocialIcon src="/assets/x-logo-white.png" invert /> });
  if (profile.linkedin_handle) connects.push({ label: profile.linkedin_handle, href: profile.linkedin_handle, icon: <SocialIcon src="/assets/linkedin-bug-white.png" invert /> });
  if (profile.huggingface_handle)
    connects.push({ label: profile.huggingface_handle, href: `https://huggingface.co/${profile.huggingface_handle}`, icon: <SocialIcon src="/assets/hf-logo.png" /> });
  if (profile.other_link) connects.push({ label: profile.other_link, href: profile.other_link, icon: <GlobeIcon /> });

  const name = profile.name || "Unnamed";
  const color = agentColor(`user:${profile.id}`);

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background box-border">
        <div className="flex gap-11 items-start flex-wrap px-[5%] pt-12 pb-20 box-border">
          {/* SIDEBAR / IDENTITY */}
          <div className="flex-none w-[260px] min-w-[240px] flex flex-col gap-[22px]">
            <div
              className="w-[88px] h-[88px] rounded-full flex items-center justify-center font-display font-normal text-[28px] text-white shadow-[0_14px_30px_rgba(28,38,33,.2)]"
              style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
            >
              {initials(name)}
            </div>

            <div>
              <div className="font-display font-normal text-[21px] text-foreground mb-1">{name}</div>
              {profile.account_type && (
                <div className="font-medium text-[13.5px] font-mono text-foreground-faint capitalize">{profile.account_type}</div>
              )}
            </div>

            <div className="flex gap-5">
              <div>
                <div className="font-display font-normal text-[17px] text-foreground">{profile.favorites?.length ?? 0}</div>
                <div className="font-medium text-[11.5px] text-foreground-faint">Agents favorited</div>
              </div>
              <div>
                <div className="font-display font-normal text-[17px] text-foreground">{profile.reviews?.length ?? 0}</div>
                <div className="font-medium text-[11.5px] text-foreground-faint">Reviews written</div>
              </div>
              {profile.follower_count !== null && (
                <div>
                  <div className="font-display font-normal text-[17px] text-foreground">{profile.follower_count}</div>
                  <div className="font-medium text-[11.5px] text-foreground-faint">Followers</div>
                </div>
              )}
            </div>

            {profile.is_owner ? (
              <Link
                href="/settings"
                className="glass-chip w-full py-[11px] rounded font-semibold text-[13.5px] text-center no-underline text-foreground"
              >
                Edit profile
              </Link>
            ) : viewer ? (
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
            ) : null}

            {error && <p className="text-error text-[12.5px] font-semibold">{error}</p>}

            {profile.is_private ? (
              <p className="text-foreground-muted text-sm">This profile is private.</p>
            ) : (
              <>
                {profile.bio && (
                  <>
                    <div className="h-px bg-foreground/8" />
                    <div>
                      <div className="font-bold text-xs text-foreground-faint uppercase tracking-wide mb-2.5">About</div>
                      <p className="m-0 text-[13.5px] leading-relaxed text-foreground/65">{profile.bio}</p>
                    </div>
                  </>
                )}

                {profile.purposes && profile.purposes.length > 0 && (
                  <div>
                    <div className="font-bold text-xs text-foreground-faint uppercase tracking-wide mb-2.5">Interested in</div>
                    <div className="flex flex-wrap gap-2">
                      {profile.purposes.map((tag) => (
                        <span
                          key={tag}
                          className="px-3 py-1.5 rounded-sm bg-blue-to/14 border border-blue-to/35 font-semibold text-[11.5px] text-blue-to"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {connects.length > 0 && (
                  <div>
                    <div className="font-bold text-xs text-foreground-faint uppercase tracking-wide mb-2.5">Connected accounts</div>
                    <div className="flex flex-col gap-0.5">
                      {connects.map((c) => (
                        <a
                          key={c.label}
                          href={c.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2.5 py-1.5 text-foreground hover:text-cyan-dark"
                        >
                          <span className="w-5 h-5 flex-none flex items-center justify-center">{c.icon}</span>
                          <span className="font-medium text-[13px] overflow-hidden text-ellipsis whitespace-nowrap">{c.label}</span>
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* MAIN CONTENT */}
          {!profile.is_private && (
            <div className="flex-1 min-w-[280px] flex flex-col gap-7">
              <div className="flex gap-6 border-b border-border overflow-x-auto">
                {TABS.map((t) => (
                  <div
                    key={t}
                    onClick={() => setTab(t)}
                    className="flex items-center gap-1.5 pb-3 font-semibold text-[13.5px] cursor-pointer whitespace-nowrap select-none"
                    style={{
                      color: tab === t ? "#1C2621" : "rgba(28,38,33,.5)",
                      borderBottom: tab === t ? "2px solid #35C0B0" : "2px solid transparent",
                    }}
                  >
                    {TAB_ICONS[t]}
                    {t === "Favorites" ? "Favorited agents" : t}
                  </div>
                ))}
              </div>

              {tab === "Contributions" && (
                <div className="flex flex-col gap-5">
                  {profile.is_owner && (
                    <Link
                      href="/contribute"
                      className="glass-panel flex items-center justify-between gap-4 px-5 py-[18px] rounded box-border no-underline text-foreground hover:border-white transition-colors"
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-9 h-9 flex-none rounded bg-cyan/14 border border-cyan/35 flex items-center justify-center text-cyan-dark font-display font-normal text-lg">
                          +
                        </div>
                        <div>
                          <div className="font-display font-normal text-sm text-foreground mb-0.5">List a new agent</div>
                          <div className="text-[12.5px] leading-relaxed text-foreground/55">
                            Share an agent you&apos;ve built with the marketplace.
                          </div>
                        </div>
                      </div>
                      <span className="font-semibold text-[13px] text-foreground-faint">→</span>
                    </Link>
                  )}
                  {(profile.contributions?.length ?? 0) === 0 ? (
                    <div className="py-9 px-5 rounded border border-dashed border-foreground/16 text-center text-foreground-faint text-[13px]">
                      No agents listed yet
                    </div>
                  ) : (
                    <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                      {profile.contributions!.map((a) => (
                        <AgentCard key={agentId(a)} agent={a} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === "Favorites" &&
                ((profile.favorites?.length ?? 0) === 0 ? (
                  <p className="text-foreground-faint text-sm">No agents favorited yet.</p>
                ) : (
                  <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
                    {profile.favorites!.map((a) => (
                      <AgentCard key={agentId(a)} agent={a} />
                    ))}
                  </div>
                ))}

              {tab === "Companies" &&
                ((profile.companies_followed?.length ?? 0) === 0 ? (
                  <p className="text-foreground-faint text-sm">Not following any companies yet.</p>
                ) : (
                  <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}>
                    {profile.companies_followed!.map((c) => (
                      <Link
                        key={`${c.source}:${c.name}`}
                        href={`/company/${c.source}/${encodeURIComponent(c.name)}`}
                        className="glass-panel flex items-center gap-3 p-[18px] rounded box-border no-underline hover:border-white transition-colors"
                      >
                        <div
                          className="w-10 h-10 flex-none rounded flex items-center justify-center font-display font-normal text-sm text-white"
                          style={{
                            background: `linear-gradient(135deg, ${agentColor(`${c.source}:${c.name}`)}, ${agentColor(`${c.source}:${c.name}`)}99)`,
                          }}
                        >
                          {initials(c.name)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-display font-normal text-sm text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                            {c.name}
                          </div>
                          <div className="font-medium text-[11.5px] text-foreground-faint">{c.source}</div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ))}

              {tab === "Reviews" &&
                ((profile.reviews?.length ?? 0) === 0 ? (
                  <p className="text-foreground-faint text-sm">No reviews written yet.</p>
                ) : (
                  <div className="flex flex-col gap-3.5">
                    {profile.reviews!.map((r) => (
                      <div key={r.id} className="glass-panel p-5 rounded box-border flex flex-col gap-2.5">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="flex items-center gap-2.5">
                            <div
                              className="w-8 h-8 rounded flex-none flex items-center justify-center font-display font-normal text-xs text-white"
                              style={{
                                background: `linear-gradient(135deg, ${agentColor(r.agent_name || "agent")}, ${agentColor(r.agent_name || "agent")}99)`,
                              }}
                            >
                              {initials(r.agent_name || "?")}
                            </div>
                            <div>
                              <Link href={`/marketplace/${agentId(r)}`} className="font-semibold text-[13.5px] text-foreground hover:text-cyan-dark">
                                on {r.agent_name || agentId(r)}
                              </Link>
                              {r.created_at && <div className="text-[11.5px] text-foreground-faint">{formatMonth(r.created_at)}</div>}
                            </div>
                          </div>
                          <Stars rating={r.rating} />
                        </div>
                        {r.text && <p className="text-[13px] leading-relaxed text-foreground-muted m-0">{r.text}</p>}
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
