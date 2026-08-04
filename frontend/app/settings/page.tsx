"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { useAuth } from "@/lib/auth";
import { updateProfile, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

const INDUSTRIES = [
  "Healthcare", "Customer Support", "Finance & Fintech", "Legal",
  "Retail & E-commerce", "Marketing", "Software Engineering", "Education",
  "HR & Recruiting", "Real Estate", "Manufacturing", "Travel & Hospitality",
  "Insurance", "Media & Entertainment", "Logistics & Supply Chain",
  "Agriculture", "Sports & Fitness",
];

const TABS = [
  {
    key: "profile",
    label: "Profile",
    desc: "Info shown on your marketplace listing.",
    icon: "M12 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 20c0-3.6 2.9-6.5 6.5-6.5s6.5 2.9 6.5 6.5",
  },
  {
    key: "connections",
    label: "Connected accounts",
    desc: "Link socials, code hosts, and your site.",
    icon: "M9.5 14.5l5-5M8.5 12l-2.2 2.2a3.4 3.4 0 0 0 4.8 4.8L13.3 16.8M15.5 12l2.2-2.2a3.4 3.4 0 0 0-4.8-4.8L10.7 7.2",
  },
  {
    key: "privacy",
    label: "Privacy",
    desc: "Control what's visible to the marketplace.",
    icon: "M12 4l7 2.5v5c0 4-3 6.6-7 8-4-1.4-7-4-7-8v-5L12 4z",
  },
  {
    key: "notifications",
    label: "Notifications",
    desc: "Choose what Genticspace emails you about.",
    icon: "M6.5 16v-5.5a5.5 5.5 0 0 1 11 0V16l1.5 2.5H5L6.5 16zM10 20.5a2 2 0 0 0 4 0",
  },
  {
    key: "security",
    label: "Security",
    desc: "Password and account security.",
    icon: "M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5M6 10.5h12V20H6zM12 14v2.5",
  },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const CONNECT_FIELDS = [
  { key: "github", label: "GitHub" },
  { key: "x", label: "X (Twitter)" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "huggingface", label: "Hugging Face" },
  { key: "website_url", label: "Website" },
  { key: "other", label: "Other link" },
] as const;

const panelClass = "glass-panel p-[26px] rounded box-border";
const inputClass =
  "w-full box-border px-3.5 py-3 rounded bg-[rgba(28,38,33,.06)] border border-border-strong text-foreground text-sm focus:outline-none focus:border-cyan";
const labelClass = "block mb-1.5 font-semibold text-[12.5px] text-foreground-muted";
const saveButtonClass =
  "self-start px-6 py-3 rounded font-semibold text-sm cursor-pointer text-white";
const saveButtonStyle = { background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" };

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      className="w-10 h-6 rounded-full flex-none cursor-pointer relative transition-colors"
      style={{ background: checked ? "#35C0B0" : "rgba(28,38,33,.15)" }}
    >
      <div
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
        style={{ left: checked ? 18 : 2 }}
      />
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  checked,
  onChange,
}: {
  label: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-b border-border last:border-b-0">
      <div>
        <div className="font-semibold text-[13.5px] text-foreground">{label}</div>
        <div className="text-[12px] text-foreground-faint">{sub}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) router.replace("/create-account?mode=login");
  }, [loading, user, router]);

  if (loading || !user) return null;

  return <SettingsForm key={user.id} user={user} />;
}

function SettingsForm({ user }: { user: User }) {
  const { token, updateUser } = useAuth();
  const [tab, setTab] = useState<TabKey>("profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState(() => ({
    name: user.name || "",
    company_name: user.company_name || "",
    bio: user.bio || "",
    industry: user.industry || "",
    website_url: user.website_url || "",
    github: user.github_username || "",
    x: user.x_handle || "",
    linkedin: user.linkedin_handle || "",
    huggingface: user.huggingface_handle || "",
    other: user.other_link || "",
    is_private: user.is_private ?? false,
    show_follower_count: user.show_follower_count ?? true,
    notify_new_follower: user.notify_new_follower ?? true,
    notify_agent_review: user.notify_agent_review ?? true,
  }));

  const isBusiness = user.account_type === "business";
  const initials = (isBusiness ? form.company_name : form.name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  async function save(fields: Record<string, unknown>) {
    if (!token) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await updateProfile(fields, token);
      updateUser(res);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save changes");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1200px] mx-auto px-[5%] py-11 box-border">
        <h1 className="font-display font-normal text-[30px] text-foreground mb-1.5 tracking-tight">Settings</h1>
        <p className="text-foreground-muted text-sm mb-8">Manage your profile, connected accounts, and security.</p>

        <div className="flex gap-11 items-start flex-wrap">
          {/* SIDEBAR NAV */}
          <div className="flex-none w-[260px] min-w-[220px] flex flex-col gap-0.5">
            {TABS.map((t) => {
              const active = tab === t.key;
              return (
                <div
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className="flex items-start gap-3 px-4 py-3.5 rounded cursor-pointer"
                  style={{
                    borderLeft: `2px solid ${active ? "#35C0B0" : "transparent"}`,
                    background: active ? "rgba(28,38,33,.05)" : "transparent",
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={active ? "#1C2621" : "rgba(28,38,33,.6)"} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="flex-none mt-px">
                    <path d={t.icon} />
                  </svg>
                  <div className="min-w-0">
                    <div className="font-semibold text-[13.5px] mb-0.5" style={{ color: active ? "#1C2621" : "rgba(28,38,33,.6)" }}>
                      {t.label}
                    </div>
                    <div className="text-[12px] leading-snug text-foreground-faint">{t.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* PANEL */}
          <div className="flex-1 min-w-[300px] flex flex-col gap-8">
            {tab === "profile" && (
              <div className={`${panelClass} flex flex-col gap-5`}>
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <span className="font-bold text-[13px] text-foreground-faint uppercase tracking-[.6px]">Profile</span>
                  <span
                    className="font-bold text-[10.5px] px-2.5 py-1 rounded-sm border"
                    style={
                      isBusiness
                        ? { color: "#178C7E", background: "rgba(53,192,176,.14)", borderColor: "rgba(53,192,176,.35)" }
                        : { color: "#3540c0", background: "rgba(53,64,192,.1)", borderColor: "rgba(53,64,192,.3)" }
                    }
                  >
                    {isBusiness ? "Business account" : "Individual account"}
                  </span>
                </div>

                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded flex-none flex items-center justify-center font-display font-normal text-2xl text-white"
                    style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)" }}
                  >
                    {initials}
                  </div>
                  <p className="m-0 text-[12.5px] text-foreground-faint leading-relaxed max-w-[280px]">
                    Your initials show up here until Genticspace supports profile photos.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>{isBusiness ? "Company name" : "Full name"}</label>
                  <input
                    className={inputClass}
                    value={isBusiness ? form.company_name : form.name}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        [isBusiness ? "company_name" : "name"]: e.target.value,
                      }))
                    }
                  />
                </div>

                {isBusiness && (
                  <div>
                    <label className={labelClass}>Industry</label>
                    <select
                      className={inputClass}
                      value={form.industry}
                      onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
                    >
                      <option value="">Select an industry</option>
                      {INDUSTRIES.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className={labelClass}>{isBusiness ? "Company bio" : "Bio"}</label>
                  <textarea
                    className={`${inputClass} min-h-[90px] resize-y`}
                    placeholder={isBusiness ? "What does your company build?" : "What are you working on?"}
                    value={form.bio}
                    onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                  />
                </div>

                {error && <p className="text-error text-[12.5px] font-semibold">{error}</p>}
                {saved && <p className="text-cyan text-[12.5px] font-semibold">Saved.</p>}

                <div
                  onClick={
                    busy
                      ? undefined
                      : () =>
                          save({
                            name: isBusiness ? undefined : form.name,
                            company_name: isBusiness ? form.company_name : undefined,
                            bio: form.bio,
                            industry: isBusiness ? form.industry : undefined,
                          })
                  }
                  className={saveButtonClass}
                  style={saveButtonStyle}
                >
                  {busy ? "Saving…" : "Save changes"}
                </div>
              </div>
            )}

            {tab === "connections" && (
              <div className={`${panelClass} flex flex-col gap-1`}>
                <span className="font-bold text-[13px] text-foreground-faint uppercase tracking-[.6px] mb-4">
                  Connected accounts
                </span>

                {CONNECT_FIELDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-4 py-3.5 border-b border-border last:border-b-0">
                    <span className="w-[110px] flex-none font-semibold text-[13px] text-foreground-muted">{label}</span>
                    <input
                      className="flex-1 min-w-0 box-border py-2 bg-transparent border-none outline-none text-foreground text-[13.5px]"
                      placeholder="Not connected"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}

                {error && <p className="text-error text-[12.5px] font-semibold mt-4">{error}</p>}
                {saved && <p className="text-cyan text-[12.5px] font-semibold mt-4">Saved.</p>}

                <div
                  onClick={
                    busy
                      ? undefined
                      : () =>
                          save({
                            website_url: form.website_url,
                            connects: {
                              github: form.github,
                              x: form.x,
                              linkedin: form.linkedin,
                              huggingface: form.huggingface,
                              other: form.other,
                            },
                          })
                  }
                  className={`${saveButtonClass} mt-4`}
                  style={saveButtonStyle}
                >
                  {busy ? "Saving…" : "Save changes"}
                </div>
              </div>
            )}

            {tab === "privacy" && (
              <div className={`${panelClass} flex flex-col`}>
                <ToggleRow
                  label="Private profile"
                  sub="Hide your contributions, favorites, and reviews from other visitors"
                  checked={form.is_private}
                  onChange={(v) => setForm((f) => ({ ...f, is_private: v }))}
                />
                <ToggleRow
                  label="Show follower count"
                  sub="Display your follower count publicly on your profile"
                  checked={form.show_follower_count}
                  onChange={(v) => setForm((f) => ({ ...f, show_follower_count: v }))}
                />

                {error && <p className="text-error text-[12.5px] font-semibold mt-4">{error}</p>}
                {saved && <p className="text-cyan text-[12.5px] font-semibold mt-4">Saved.</p>}

                <div
                  onClick={
                    busy
                      ? undefined
                      : () =>
                          save({
                            is_private: form.is_private,
                            show_follower_count: form.show_follower_count,
                          })
                  }
                  className={`${saveButtonClass} mt-4`}
                  style={saveButtonStyle}
                >
                  {busy ? "Saving…" : "Save changes"}
                </div>
              </div>
            )}

            {tab === "notifications" && (
              <div className={`${panelClass} flex flex-col`}>
                <ToggleRow
                  label="New follower"
                  sub="Get notified when someone follows you"
                  checked={form.notify_new_follower}
                  onChange={(v) => setForm((f) => ({ ...f, notify_new_follower: v }))}
                />
                <ToggleRow
                  label="New review"
                  sub="Get notified when someone reviews your agent"
                  checked={form.notify_agent_review}
                  onChange={(v) => setForm((f) => ({ ...f, notify_agent_review: v }))}
                />

                {error && <p className="text-error text-[12.5px] font-semibold mt-4">{error}</p>}
                {saved && <p className="text-cyan text-[12.5px] font-semibold mt-4">Saved.</p>}

                <div
                  onClick={
                    busy
                      ? undefined
                      : () =>
                          save({
                            notify_new_follower: form.notify_new_follower,
                            notify_agent_review: form.notify_agent_review,
                          })
                  }
                  className={`${saveButtonClass} mt-4`}
                  style={saveButtonStyle}
                >
                  {busy ? "Saving…" : "Save changes"}
                </div>
              </div>
            )}

            {tab === "security" && (
              <div className={`${panelClass} flex flex-col gap-4`}>
                <div>
                  <div className="font-display font-normal text-base text-foreground mb-1">Password</div>
                  <p className="m-0 text-[12.5px] leading-relaxed text-foreground-faint">
                    Change or reset your password on a dedicated, secure page.
                  </p>
                </div>
                <a
                  href="/reset-password"
                  className="self-start px-5 py-2.5 rounded font-semibold text-[13px] bg-[rgba(28,38,33,.06)] border border-border-strong text-foreground no-underline"
                >
                  Change password
                </a>

                <div className="pt-2 border-t border-border">
                  <div className="font-display font-normal text-base text-foreground mb-1.5 mt-3">Coming soon</div>
                  <p className="m-0 text-[13px] leading-relaxed text-foreground-muted">
                    Two-factor authentication, active session management, recovery codes, and a security log are on
                    the way. This section isn&apos;t wired up yet, so we don&apos;t show controls that don&apos;t
                    actually do anything.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
