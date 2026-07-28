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

const TABS = ["Profile", "Connections", "Security", "Notifications", "Privacy"] as const;
type Tab = (typeof TABS)[number];

const inputClass =
  "w-full box-border px-3.5 py-2.5 rounded bg-[rgba(244,247,243,.06)] border border-border-strong text-foreground text-sm focus:outline-none focus:border-cyan";
const labelClass = "block mb-1.5 font-semibold text-[12.5px] text-foreground-muted";

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
  const [tab, setTab] = useState<Tab>("Profile");
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

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[900px] mx-auto px-[5%] py-12 box-border">
        <h1 className="font-display font-bold text-[30px] text-foreground mb-1.5">Settings</h1>
        <p className="text-foreground-muted text-sm mb-8">Manage your account, profile, and preferences.</p>

        <div className="flex gap-1 mb-8 border-b border-border overflow-x-auto">
          {TABS.map((t) => (
            <div
              key={t}
              onClick={() => setTab(t)}
              className="px-4 py-2.5 font-semibold text-[13px] cursor-pointer whitespace-nowrap"
              style={{
                color: tab === t ? "#1C2621" : "rgba(28,38,33,.5)",
                borderBottom: tab === t ? "2px solid #35C0B0" : "2px solid transparent",
              }}
            >
              {t}
            </div>
          ))}
        </div>

        {tab === "Profile" && (
          <div className="flex flex-col gap-4 max-w-[520px]">
            <div className="flex items-center gap-3 mb-2">
              <span className="px-2.5 py-1 rounded-sm border font-semibold text-[11px] bg-[rgba(244,247,243,.06)] border-border text-foreground-muted">
                {isBusiness ? "Business account" : "Individual account"}
              </span>
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
              className="self-start px-6 py-3 rounded font-semibold text-sm cursor-pointer text-white"
              style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" }}
            >
              {busy ? "Saving…" : "Save changes"}
            </div>
          </div>
        )}

        {tab === "Connections" && (
          <div className="flex flex-col gap-4 max-w-[520px]">
            {([
              ["github", "GitHub"],
              ["x", "X (Twitter)"],
              ["linkedin", "LinkedIn"],
              ["huggingface", "Hugging Face"],
              ["other", "Other link"],
            ] as const).map(([key, label]) => (
              <div key={key}>
                <label className={labelClass}>{label}</label>
                <input
                  className={inputClass}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}

            {error && <p className="text-error text-[12.5px] font-semibold">{error}</p>}
            {saved && <p className="text-cyan text-[12.5px] font-semibold">Saved.</p>}

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
              className="self-start px-6 py-3 rounded font-semibold text-sm cursor-pointer text-white"
              style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" }}
            >
              {busy ? "Saving…" : "Save changes"}
            </div>
          </div>
        )}

        {tab === "Security" && (
          <div className="max-w-[520px] p-6 rounded bg-surface-2 border border-border text-center">
            <div className="font-display font-bold text-[15px] text-foreground mb-1.5">Coming soon</div>
            <p className="text-foreground-muted text-[13px] leading-relaxed">
              Two-factor authentication, active session management, and recovery codes are on the way.
              This section isn&apos;t wired up yet so we don&apos;t show security controls that don&apos;t
              actually do anything.
            </p>
          </div>
        )}

        {tab === "Notifications" && (
          <div className="max-w-[520px]">
            <div className="rounded bg-surface-2 border border-border px-5">
              <NotificationRow
                label="New follower"
                sub="Get notified when someone follows you"
                checked={form.notify_new_follower}
                onChange={(v) => setForm((f) => ({ ...f, notify_new_follower: v }))}
              />
              <NotificationRow
                label="New review"
                sub="Get notified when someone reviews your agent"
                checked={form.notify_agent_review}
                onChange={(v) => setForm((f) => ({ ...f, notify_agent_review: v }))}
              />
            </div>

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
              className="mt-4 self-start inline-block px-6 py-3 rounded font-semibold text-sm cursor-pointer text-white"
              style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" }}
            >
              {busy ? "Saving…" : "Save changes"}
            </div>
          </div>
        )}

        {tab === "Privacy" && (
          <div className="max-w-[520px]">
            <div className="rounded bg-surface-2 border border-border px-5">
              <NotificationRow
                label="Private profile"
                sub="Hide your contributions, favorites, and reviews from other visitors"
                checked={form.is_private}
                onChange={(v) => setForm((f) => ({ ...f, is_private: v }))}
              />
              <NotificationRow
                label="Show follower count"
                sub="Display your follower count publicly on your profile"
                checked={form.show_follower_count}
                onChange={(v) => setForm((f) => ({ ...f, show_follower_count: v }))}
              />
            </div>

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
              className="mt-4 self-start inline-block px-6 py-3 rounded font-semibold text-sm cursor-pointer text-white"
              style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" }}
            >
              {busy ? "Saving…" : "Save changes"}
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
