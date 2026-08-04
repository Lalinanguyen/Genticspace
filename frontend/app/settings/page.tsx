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
  { key: "profile", label: "Profile", desc: "Info shown on your marketplace listing." },
  { key: "connections", label: "Connected accounts", desc: "Link socials and code hosts to your profile." },
  { key: "privacy", label: "Privacy", desc: "Control what's visible to the marketplace." },
  { key: "notifications", label: "Notifications", desc: "Choose what Tracent emails you about." },
  { key: "security", label: "Security", desc: "Password and account protection." },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const inputClass =
  "w-full box-border px-3.5 py-3 rounded bg-[rgba(28,38,33,.06)] border border-border-strong text-foreground text-sm focus:outline-none focus:border-cyan";
const labelClass = "block mb-1.5 font-semibold text-[12.5px] text-foreground-muted";
const badgeClass = "px-2.5 py-1 rounded-sm border font-semibold text-[11px] bg-cyan/14 border-cyan/35 text-cyan";
const ctaClass = "self-start px-6 py-3 rounded font-semibold text-sm cursor-pointer text-white";
const ctaStyle = { background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" };

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      className={`w-10 h-6 rounded flex-none cursor-pointer relative transition-colors ${checked ? "bg-cyan" : "bg-foreground/15"}`}
    >
      <div
        className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
        style={{ left: checked ? 18 : 2 }}
      />
    </div>
  );
}

function ToggleCard({
  title,
  sub,
  checked,
  onChange,
}: {
  title: string;
  sub: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="glass-panel rounded px-5 py-5 md:px-[26px] md:py-[22px] flex items-center justify-between gap-4">
      <div>
        <div className="font-display font-normal text-sm text-foreground mb-1">{title}</div>
        <div className="text-[12.5px] leading-relaxed text-foreground-muted">{sub}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function NotificationRow({
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

  const CONNECT_META = [
    { key: "github", label: "GitHub", icon: "/assets/github-mark-clean.svg", invert: false },
    { key: "x", label: "X (Twitter)", icon: "/assets/x-logo-white.png", invert: true },
    { key: "linkedin", label: "LinkedIn", icon: "/assets/linkedin-bug-white.png", invert: true },
    { key: "huggingface", label: "Hugging Face", icon: "/assets/hf-logo.png", invert: false },
    { key: "other", label: "Other link", icon: null, invert: false },
  ] as const;

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1100px] mx-auto px-[5%] py-11 box-border">
        <h1 className="font-display font-normal text-[30px] text-foreground mb-1.5">Settings</h1>
        <p className="text-foreground-muted text-sm mb-8">
          Manage your profile, connected accounts, and security.
        </p>

        <div className="flex gap-11 items-start flex-wrap">
          {/* SIDEBAR NAV */}
          <div className="flex-none w-[260px] min-w-[220px] flex flex-col gap-0.5">
            {TABS.map((t) => (
              <div
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-3.5 rounded cursor-pointer border-l-2 transition-colors ${
                  tab === t.key
                    ? "bg-surface-2 border-cyan shadow-[0_10px_28px_rgba(28,38,33,.12)]"
                    : "border-transparent hover:bg-surface"
                }`}
              >
                <div
                  className={`font-semibold text-[13.5px] mb-0.5 ${
                    tab === t.key ? "text-foreground" : "text-foreground-muted"
                  }`}
                >
                  {t.label}
                </div>
                <div className="text-[12px] leading-relaxed text-foreground-faint">{t.desc}</div>
              </div>
            ))}
          </div>

          {/* PANEL */}
          <div className="flex-1 min-w-[300px] flex flex-col gap-8">
            {tab === "profile" && (
              <div className="glass-panel rounded p-6 md:p-[26px] flex flex-col gap-5">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <span className="font-bold text-[13px] uppercase tracking-wide text-foreground-faint">
                    Profile
                  </span>
                  <span className={badgeClass}>{isBusiness ? "Business account" : "Individual account"}</span>
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
                  <label className={labelClass}>Website</label>
                  <input
                    className={inputClass}
                    placeholder="https://"
                    value={form.website_url}
                    onChange={(e) => setForm((f) => ({ ...f, website_url: e.target.value }))}
                  />
                </div>

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
                            website_url: form.website_url,
                          })
                  }
                  className={ctaClass}
                  style={ctaStyle}
                >
                  {busy ? "Saving…" : "Save changes"}
                </div>
              </div>
            )}

            {tab === "connections" && (
              <div className="glass-panel rounded p-6 md:p-[26px] flex flex-col gap-2">
                <span className="font-bold text-[13px] uppercase tracking-wide text-foreground-faint mb-2">
                  Connected accounts
                </span>

                {CONNECT_META.map(({ key, label, icon, invert }) => (
                  <div key={key} className="flex items-center gap-3.5 py-3.5 border-b border-border last:border-b-0">
                    <div className="w-8 h-8 flex-none rounded bg-surface-2 border border-border flex items-center justify-center overflow-hidden">
                      {icon ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={icon}
                          alt=""
                          className="w-4 h-4 object-contain"
                          style={invert ? { filter: "brightness(0)" } : undefined}
                        />
                      ) : (
                        <span className="text-foreground-faint text-sm font-bold">+</span>
                      )}
                    </div>
                    <span className="w-[110px] flex-none font-semibold text-[13px] text-foreground-muted">
                      {label}
                    </span>
                    <input
                      className="flex-1 min-w-0 bg-transparent border-none outline-none text-foreground text-[13.5px] py-2 focus:outline-none"
                      placeholder="Not connected"
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </div>
                ))}

                {error && <p className="text-error text-[12.5px] font-semibold mt-2">{error}</p>}
                {saved && <p className="text-cyan text-[12.5px] font-semibold mt-2">Saved.</p>}

                <div
                  onClick={
                    busy
                      ? undefined
                      : () =>
                          save({
                            connects: {
                              github: form.github,
                              x: form.x,
                              linkedin: form.linkedin,
                              huggingface: form.huggingface,
                              other: form.other,
                            },
                          })
                  }
                  className={`${ctaClass} mt-2`}
                  style={ctaStyle}
                >
                  {busy ? "Saving…" : "Save changes"}
                </div>
              </div>
            )}

            {tab === "security" && (
              <div className="glass-panel rounded p-6 text-center">
                <div className="font-display font-normal text-[15px] text-foreground mb-1.5">Coming soon</div>
                <p className="text-foreground-muted text-[13px] leading-relaxed">
                  Two-factor authentication, active session management, and recovery codes are on the way.
                  This section isn&apos;t wired up yet so we don&apos;t show security controls that don&apos;t
                  actually do anything.
                </p>
              </div>
            )}

            {tab === "notifications" && (
              <div className="flex flex-col gap-4">
                <div className="glass-panel rounded p-6 md:p-[26px]">
                  <NotificationRow
                    label="New followers"
                    sub="Someone starts following you"
                    checked={form.notify_new_follower}
                    onChange={(v) => setForm((f) => ({ ...f, notify_new_follower: v }))}
                  />
                  <NotificationRow
                    label="New agent reviews"
                    sub="A buyer leaves a review on one of your agents"
                    checked={form.notify_agent_review}
                    onChange={(v) => setForm((f) => ({ ...f, notify_agent_review: v }))}
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
                            notify_new_follower: form.notify_new_follower,
                            notify_agent_review: form.notify_agent_review,
                          })
                  }
                  className={ctaClass}
                  style={ctaStyle}
                >
                  {busy ? "Saving…" : "Save changes"}
                </div>
              </div>
            )}

            {tab === "privacy" && (
              <div className="flex flex-col gap-4">
                <ToggleCard
                  title={form.is_private ? "Private profile" : "Public profile"}
                  sub={
                    form.is_private
                      ? "Hide your contributions, favorites, and reviews from other visitors."
                      : "Discoverable to everyone browsing the marketplace."
                  }
                  checked={form.is_private}
                  onChange={(v) => setForm((f) => ({ ...f, is_private: v }))}
                />
                <ToggleCard
                  title="Show follower count"
                  sub="Display your follower count publicly on your profile."
                  checked={form.show_follower_count}
                  onChange={(v) => setForm((f) => ({ ...f, show_follower_count: v }))}
                />

                {error && <p className="text-error text-[12.5px] font-semibold">{error}</p>}
                {saved && <p className="text-cyan text-[12.5px] font-semibold">Saved.</p>}

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
                  className={ctaClass}
                  style={ctaStyle}
                >
                  {busy ? "Saving…" : "Save changes"}
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
