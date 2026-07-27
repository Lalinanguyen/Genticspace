"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { createAgentListing, getMyAgents, ApiError } from "@/lib/api";
import type { Agent, AgentListingInput } from "@/lib/types";
import { AgentCard } from "@/components/marketplace/AgentCard";

const INTERACTION_TYPES = ["A2A", "B2B", "B2C"];
const SDKS = ["Python", "TypeScript / JS", "REST API", "gRPC"];
const INDUSTRIES = [
  "Customer Support",
  "Software Engineering",
  "Healthcare",
  "Finance & Fintech",
  "Legal",
  "Retail & E-commerce",
  "Marketing",
  "Education",
  "HR & Recruiting",
];
const LICENSES = ["Open Source", "Commercial", "Freemium", "Enterprise"];
const DEPLOYMENTS = ["Cloud", "On-prem", "API"];
const ACCESS_MODELS = ["Immediate use", "Must contact vendor", "Other"];
const PRICING_MODELS = ["Free", "Subscription", "Pay per call", "Custom quote"];

const EMPTY_FORM: AgentListingInput = {
  name: "",
  description: "",
  image_url: "",
  demo_url: "",
  github_url: "",
  huggingface_url: "",
  ard_ref: "",
  producthunt_url: "",
  erc8004_ref: "",
  website_url: "",
  contact_email: "",
  support_channel: "",
  terms_url: "",
  interaction_types: [],
  sdk_compat: [],
  industry_tags: [],
  license: "Commercial",
  deployment_types: ["Cloud"],
  access_model: "Immediate use",
  pricing_model: "Free",
  is_private: false,
};

function simplify(text: string): string {
  const t = text.trim();
  if (!t) return "";
  const first = t.split(/(?<=[.!?])\s+/)[0];
  return `In simple terms: this agent ${first.charAt(0).toLowerCase()}${first
    .slice(1)
    .replace(/\.$/, "")}, no technical setup needed on your end.`;
}

function toggleInArray(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <span
      onClick={onClick}
      className="cursor-pointer px-[15px] py-2.5 rounded-sm border text-[12.5px] font-semibold select-none"
      style={{
        background: active ? "rgba(53,192,176,.14)" : "rgba(244,247,243,.05)",
        borderColor: active ? "rgba(53,192,176,.4)" : "rgba(244,247,243,.14)",
        color: active ? "#35C0B0" : "rgba(244,247,243,.7)",
      }}
    >
      {label}
    </span>
  );
}

function RemovablePill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      onClick={onRemove}
      className="cursor-pointer px-[15px] py-2.5 rounded-sm border text-[12.5px] font-semibold select-none"
      style={{
        background: "rgba(53,192,176,.14)",
        borderColor: "rgba(53,192,176,.4)",
        color: "#35C0B0",
      }}
    >
      {label} ×
    </span>
  );
}

function AddOtherPill({
  open,
  value,
  onOpen,
  onChange,
  onCommit,
  onCancel,
  placeholder,
}: {
  open: boolean;
  value: string;
  onOpen: () => void;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
  placeholder: string;
}) {
  if (open) {
    return (
      <input
        autoFocus
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={onCommit}
        className="w-[140px] box-border px-3 py-2.5 rounded-sm bg-surface border border-border-strong text-foreground text-[12.5px] font-semibold"
      />
    );
  }
  return (
    <span
      onClick={onOpen}
      className="cursor-pointer px-[15px] py-2.5 rounded-sm border border-dashed text-[12.5px] font-semibold select-none text-foreground-muted"
      style={{ background: "rgba(244,247,243,.05)", borderColor: "rgba(244,247,243,.25)" }}
    >
      + Other
    </span>
  );
}

function IconLabel({ icon, text }: { icon: string; text: string }) {
  return (
    <label className="flex items-center gap-1.5 mb-[7px] font-semibold text-[12.5px] text-foreground-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={icon} alt="" className="w-4 h-4 object-contain flex-none" />
      {text} <span className="text-foreground-faint font-normal">(optional)</span>
    </label>
  );
}

// No file upload infra exists yet, so these are URL-based rather than true
// drag-and-drop uploads (the design's image-slot widgets are decorative
// placeholders in the prototype itself, not a working upload either).
function ImageUrlSlot({
  value,
  onChange,
  width,
  height,
  placeholder,
}: {
  value: string | undefined;
  onChange: (v: string) => void;
  width: number | string;
  height: number;
  placeholder: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");

  if (editing) {
    return (
      <div
        className="rounded flex-none bg-surface border border-border-strong flex items-center justify-center p-2 box-border"
        style={{ width, height }}
      >
        <input
          autoFocus
          type="text"
          value={draft}
          placeholder="Image URL"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onChange(draft.trim());
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={() => {
            onChange(draft.trim());
            setEditing(false);
          }}
          className="w-full box-border px-2 py-1.5 rounded-sm bg-[rgba(244,247,243,.06)] border border-border text-foreground text-[11.5px] focus:outline-none focus:border-cyan"
        />
      </div>
    );
  }

  if (value) {
    return (
      <div
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        className="rounded flex-none overflow-hidden bg-surface border border-border-strong cursor-pointer relative group"
        style={{ width, height }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={value} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="rounded flex-none bg-[rgba(244,247,243,.06)] border border-border-strong cursor-pointer flex items-center justify-center text-center px-3"
      style={{ width, height }}
    >
      <span className="text-[12px] font-semibold text-foreground-faint">{placeholder}</span>
    </div>
  );
}

function fieldLabel(text: string, optional = true) {
  return (
    <label className="block mb-[7px] font-semibold text-[12.5px] text-foreground-muted">
      {text} {optional && <span className="text-foreground-faint font-normal">(optional)</span>}
    </label>
  );
}

function textInputClass() {
  return "w-full box-border px-3.5 py-3 rounded bg-surface border border-border-strong text-foreground text-[13.5px] placeholder:text-foreground-faint";
}

export function ListingForm() {
  const { token, loading } = useAuth();
  const [form, setForm] = useState<AgentListingInput>(EMPTY_FORM);
  const [otherTagOpen, setOtherTagOpen] = useState(false);
  const [otherTagInput, setOtherTagInput] = useState("");
  const [otherDeployOpen, setOtherDeployOpen] = useState(false);
  const [otherDeployInput, setOtherDeployInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Agent | null>(null);
  const [myAgents, setMyAgents] = useState<Agent[]>([]);
  const [needsAuth, setNeedsAuth] = useState(false);

  useEffect(() => {
    if (!token) return;
    getMyAgents(token)
      .then((res) => setMyAgents(res.agents))
      .catch(() => {});
  }, [token, created]);

  function set<K extends keyof AgentListingInput>(key: K, value: AgentListingInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function commitOtherTag() {
    const val = otherTagInput.trim();
    if (val) set("industry_tags", [...form.industry_tags, val]);
    setOtherTagInput("");
    setOtherTagOpen(false);
  }

  function commitOtherDeploy() {
    const val = otherDeployInput.trim();
    if (val) set("deployment_types", [...form.deployment_types, val]);
    setOtherDeployInput("");
    setOtherDeployOpen(false);
  }

  async function publish() {
    if (!canPublish) return;
    if (!token) {
      setNeedsAuth(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const agent = await createAgentListing(form, token);
      setCreated(agent);
      setForm(EMPTY_FORM);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canPublish = form.name.trim().length > 0 && form.description.trim().length > 0;
  const showAiSuggestion = form.description.trim().length > 20;
  const aiSuggestion = simplify(form.description);

  const previewName = form.name.trim() || "Your agent name";
  const initials =
    previewName
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "AG";
  const allTags = [...form.interaction_types, ...form.sdk_compat, ...form.industry_tags];

  if (loading) return null;

  if (created) {
    return (
      <div className="max-w-[520px] mx-auto text-center py-20 px-6">
        <h2 className="font-display font-bold text-2xl text-foreground mb-3">
          Listing {created.is_private ? "saved" : "published"}
        </h2>
        <p className="text-foreground-muted text-[15px] mb-2">
          <span className="font-semibold text-foreground">{created.name}</span> is now{" "}
          {created.is_private ? "saved as private." : "live in the marketplace."}
        </p>
        <p className="text-foreground-faint text-[13px] font-mono mb-7">{created.tracent_id}</p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setCreated(null)}
            className="px-6 py-3 rounded font-semibold text-[14px] bg-surface border border-border-strong text-foreground"
          >
            Create another
          </button>
          {!created.is_private && (
            <Link
              href="/marketplace"
              className="px-6 py-3 rounded font-semibold text-[14px] text-white"
              style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)" }}
            >
              View in marketplace
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-11 items-start flex-wrap">
      {/* FORM */}
      <div className="flex-1 flex flex-col gap-8" style={{ flexBasis: 520, minWidth: 300 }}>
        {/* BASICS */}
        <div className="p-[26px] rounded bg-surface-2 border border-border shadow-[0_10px_28px_rgba(0,0,0,.35)] flex flex-col gap-[18px] box-border">
          <span className="font-bold text-[13px] text-foreground-faint uppercase tracking-wide">
            Basics
          </span>

          <div className="flex items-center gap-4">
            <ImageUrlSlot
              value={form.image_url}
              onChange={(v) => set("image_url", v)}
              width={110}
              height={110}
              placeholder="+ Photo"
            />
            <div className="flex-1 min-w-0">
              {fieldLabel("Name", false)}
              <input
                type="text"
                placeholder="e.g. Atlas Vision"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                maxLength={200}
                className={textInputClass()}
              />
            </div>
          </div>

          <div>
            {fieldLabel("Screenshot or demo")}
            <ImageUrlSlot
              value={form.demo_url}
              onChange={(v) => set("demo_url", v)}
              width="100%"
              height={200}
              placeholder="Drop a screenshot or demo clip"
            />
          </div>

          <div className="flex gap-4 flex-wrap">
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              <IconLabel icon="/assets/github-mark-clean.svg" text="GitHub repo" />
              <input
                type="text"
                placeholder="github.com/org/agent"
                value={form.github_url}
                onChange={(e) => set("github_url", e.target.value)}
                className={textInputClass()}
              />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              <IconLabel icon="/assets/hf-logo.png" text="Hugging Face" />
              <input
                type="text"
                placeholder="huggingface.co/org/agent"
                value={form.huggingface_url}
                onChange={(e) => set("huggingface_url", e.target.value)}
                className={textInputClass()}
              />
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              <IconLabel icon="/assets/google-icon-transparent.png" text="Google ARD" />
              <input
                type="text"
                placeholder="Registry ID"
                value={form.ard_ref}
                onChange={(e) => set("ard_ref", e.target.value)}
                className={textInputClass()}
              />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              <IconLabel icon="/assets/producthunt-logo.png" text="Product Hunt" />
              <input
                type="text"
                placeholder="producthunt.com/products/your-agent"
                value={form.producthunt_url}
                onChange={(e) => set("producthunt_url", e.target.value)}
                className={textInputClass()}
              />
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              {fieldLabel("Website")}
              <input
                type="text"
                placeholder="https://youragent.ai"
                value={form.website_url}
                onChange={(e) => set("website_url", e.target.value)}
                className={textInputClass()}
              />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              {fieldLabel("Contact email")}
              <input
                type="email"
                placeholder="hello@youragent.ai"
                value={form.contact_email}
                onChange={(e) => set("contact_email", e.target.value)}
                className={textInputClass()}
              />
            </div>
          </div>

          <div className="flex gap-4 flex-wrap">
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              {fieldLabel("Support channel")}
              <input
                type="text"
                placeholder="Discord or Slack invite link"
                value={form.support_channel}
                onChange={(e) => set("support_channel", e.target.value)}
                className={textInputClass()}
              />
            </div>
            <div style={{ flex: "1 1 200px", minWidth: 180 }}>
              {fieldLabel("Terms of service")}
              <input
                type="text"
                placeholder="https://youragent.ai/terms"
                value={form.terms_url}
                onChange={(e) => set("terms_url", e.target.value)}
                className={textInputClass()}
              />
            </div>
          </div>

          <div>
            {fieldLabel("ERC-8004 identity")}
            <input
              type="text"
              placeholder="Registry contract address or agent ID"
              value={form.erc8004_ref}
              onChange={(e) => set("erc8004_ref", e.target.value)}
              className={textInputClass() + " font-mono"}
            />
            <p className="mt-2 text-[12px] leading-relaxed text-foreground-faint">
              On-chain identity reference, shown on your listing. Verified badges are only granted
              to listings created by the company itself.
            </p>
          </div>

          <div>
            <label className="block mb-[7px] font-semibold text-[12.5px] text-foreground-muted">
              Interaction type
            </label>
            <div className="flex flex-wrap gap-2">
              {INTERACTION_TYPES.map((name) => (
                <Pill
                  key={name}
                  label={name}
                  active={form.interaction_types.includes(name)}
                  onClick={() => set("interaction_types", toggleInArray(form.interaction_types, name))}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block mb-[7px] font-semibold text-[12.5px] text-foreground-muted">
              SDK / API compatibility
            </label>
            <div className="flex flex-wrap gap-2">
              {SDKS.map((name) => (
                <Pill
                  key={name}
                  label={name}
                  active={form.sdk_compat.includes(name)}
                  onClick={() => set("sdk_compat", toggleInArray(form.sdk_compat, name))}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block mb-[7px] font-semibold text-[12.5px] text-foreground-muted">
              Industry tags
            </label>
            <div className="flex flex-wrap gap-2">
              {INDUSTRIES.map((name) => (
                <Pill
                  key={name}
                  label={name}
                  active={form.industry_tags.includes(name)}
                  onClick={() => set("industry_tags", toggleInArray(form.industry_tags, name))}
                />
              ))}
              {form.industry_tags
                .filter((t) => !INDUSTRIES.includes(t))
                .map((tag) => (
                  <RemovablePill
                    key={tag}
                    label={tag}
                    onRemove={() => set("industry_tags", form.industry_tags.filter((t) => t !== tag))}
                  />
                ))}
              <AddOtherPill
                open={otherTagOpen}
                value={otherTagInput}
                onOpen={() => setOtherTagOpen(true)}
                onChange={setOtherTagInput}
                onCommit={commitOtherTag}
                onCancel={() => {
                  setOtherTagInput("");
                  setOtherTagOpen(false);
                }}
                placeholder="Custom tag"
              />
            </div>
          </div>

          <div>
            <label className="block mb-[7px] font-semibold text-[12.5px] text-foreground-muted">
              Description
            </label>
            <textarea
              placeholder="What does this agent do, in one or two plain-English sentences?"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={5000}
              className="w-full box-border min-h-[84px] px-3.5 py-3 rounded bg-surface border border-border-strong text-foreground text-[14px] leading-relaxed placeholder:text-foreground-faint resize-y"
            />
            {showAiSuggestion && (
              <div className="mt-2.5 p-3.5 rounded flex gap-3 items-start" style={{ background: "rgba(53,192,176,.07)", border: "1px solid rgba(53,192,176,.25)" }}>
                <div className="w-[22px] h-[22px] flex-none rounded flex items-center justify-center font-display font-bold text-[11px] text-background" style={{ background: "linear-gradient(135deg,#35C0B0,#1F8A7E)" }}>
                  AI
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[11.5px] text-cyan mb-1 uppercase tracking-wide">
                    Plain-English rewrite
                  </div>
                  <p className="m-0 mb-2 text-[13px] leading-relaxed text-foreground-muted">{aiSuggestion}</p>
                  <span
                    onClick={() => set("description", aiSuggestion)}
                    className="cursor-pointer font-semibold text-[12px] text-cyan"
                  >
                    Use this wording
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* VISIBILITY */}
        <div className="p-[26px] rounded bg-surface-2 border border-border shadow-[0_10px_28px_rgba(0,0,0,.35)] flex items-center justify-between gap-4 flex-wrap box-border">
          <div>
            <div className="font-display font-bold text-sm text-foreground mb-1">
              {form.is_private ? "Private listing" : "Public listing"}
            </div>
            <div className="text-[12.5px] leading-relaxed text-foreground-muted">
              {form.is_private
                ? "Only visible to you, via My Agents."
                : "Discoverable to everyone browsing the marketplace."}
            </div>
          </div>
          <button
            onClick={() => set("is_private", !form.is_private)}
            className="w-11 h-6 rounded-sm flex-none relative"
            style={{ background: form.is_private ? "rgba(244,247,243,.15)" : "#35C0B0" }}
          >
            <span
              className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all"
              style={{ left: form.is_private ? "2px" : "22px" }}
            />
          </button>
        </div>

        {/* LICENSING & DEPLOYMENT */}
        <div className="p-[26px] rounded bg-surface-2 border border-border shadow-[0_10px_28px_rgba(0,0,0,.35)] flex flex-col gap-[18px] box-border">
          <span className="font-bold text-[13px] text-foreground-faint uppercase tracking-wide">
            Licensing &amp; deployment
          </span>

          <div>
            <div className="font-semibold text-[12.5px] text-foreground-muted mb-2.5">License</div>
            <div className="flex flex-wrap gap-2">
              {LICENSES.map((name) => (
                <Pill key={name} label={name} active={form.license === name} onClick={() => set("license", name)} />
              ))}
            </div>
          </div>

          <div>
            <div className="font-semibold text-[12.5px] text-foreground-muted mb-2.5">
              Deployment (choose all that apply)
            </div>
            <div className="flex flex-wrap gap-2">
              {DEPLOYMENTS.map((name) => (
                <Pill
                  key={name}
                  label={name}
                  active={form.deployment_types.includes(name)}
                  onClick={() => set("deployment_types", toggleInArray(form.deployment_types, name))}
                />
              ))}
              {form.deployment_types
                .filter((t) => !DEPLOYMENTS.includes(t))
                .map((tag) => (
                  <RemovablePill
                    key={tag}
                    label={tag}
                    onRemove={() => set("deployment_types", form.deployment_types.filter((t) => t !== tag))}
                  />
                ))}
              <AddOtherPill
                open={otherDeployOpen}
                value={otherDeployInput}
                onOpen={() => setOtherDeployOpen(true)}
                onChange={setOtherDeployInput}
                onCommit={commitOtherDeploy}
                onCancel={() => {
                  setOtherDeployInput("");
                  setOtherDeployOpen(false);
                }}
                placeholder="Custom deployment"
              />
            </div>
          </div>

          <div>
            <div className="font-semibold text-[12.5px] text-foreground-muted mb-2.5">
              How buyers get access
            </div>
            <div className="flex flex-wrap gap-2">
              {ACCESS_MODELS.map((name) => (
                <Pill key={name} label={name} active={form.access_model === name} onClick={() => set("access_model", name)} />
              ))}
            </div>
          </div>

          <div>
            <div className="font-semibold text-[12.5px] text-foreground-muted mb-2.5">Pricing model</div>
            <div className="flex flex-wrap gap-2">
              {PRICING_MODELS.map((name) => (
                <Pill key={name} label={name} active={form.pricing_model === name} onClick={() => set("pricing_model", name)} />
              ))}
            </div>
          </div>
        </div>

        {myAgents.length > 0 && (
          <div className="flex flex-col gap-4">
            <span className="font-display font-bold text-sm text-foreground">Your listings</span>
            <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
              {myAgents.map((agent) => (
                <AgentCard key={agent.tracent_id} agent={agent} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* LIVE PREVIEW */}
      <div className="flex-none w-[340px] sticky top-6" style={{ minWidth: 280 }}>
        <div className="font-bold text-[12.5px] text-foreground-faint uppercase tracking-wide mb-3.5">
          Listing preview
        </div>

        <div className="p-[22px] rounded bg-surface-2 border border-border shadow-[0_10px_28px_rgba(0,0,0,.35)] flex flex-col gap-3.5 box-border">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded flex-none bg-gradient-to-br from-blue to-cyan flex items-center justify-center font-display font-bold text-[15px] text-white">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display font-bold text-base text-foreground">{previewName}</span>
                {form.is_private && (
                  <span className="text-[10.5px] font-semibold text-foreground-muted px-2 py-0.5 rounded-sm bg-surface border border-border">
                    Private
                  </span>
                )}
              </div>
              <div className="text-[12.5px] text-foreground-faint">
                {allTags.length ? allTags.join(" · ") : "No tags selected"}
              </div>
            </div>
          </div>

          <p className="m-0 text-[13px] leading-relaxed text-foreground-muted">
            {form.description.trim() || "Your description will appear here as you type."}
          </p>

          <div className="flex gap-1.5 flex-wrap">
            <span className="px-2.5 py-1 rounded-sm bg-[rgba(244,247,243,.06)] border border-border font-semibold text-[11px] text-foreground-muted">
              {form.license}
            </span>
            {form.deployment_types.map((dep) => (
              <span key={dep} className="px-2.5 py-1 rounded-sm bg-[rgba(244,247,243,.06)] border border-border font-semibold text-[11px] text-foreground-muted">
                {dep}
              </span>
            ))}
            <span className="px-2.5 py-1 rounded-sm bg-[rgba(244,247,243,.06)] border border-border font-semibold text-[11px] text-foreground-muted">
              {form.access_model}
            </span>
            <span className="px-2.5 py-1 rounded-sm bg-[rgba(53,192,176,.1)] border border-[rgba(53,192,176,.3)] font-semibold text-[11px] text-cyan">
              {form.pricing_model}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 mt-4.5">
          {error && <span className="text-center text-[12.5px] font-medium text-error">{error}</span>}
          <div
            onClick={submitting ? undefined : publish}
            className="text-center px-7 py-[15px] rounded font-semibold text-[15px]"
            style={{
              background: "linear-gradient(135deg,#072AC8,#2f4fe0)",
              color: canPublish ? "#fff" : "rgba(255,255,255,.5)",
              cursor: canPublish && !submitting ? "pointer" : "default",
              boxShadow: canPublish ? "0 10px 30px rgba(7,42,200,.45)" : "none",
            }}
          >
            {submitting ? "Publishing…" : form.is_private ? "Save as private" : "Publish listing"}
          </div>
          <span className="text-center font-medium text-[12.5px] text-foreground-faint">
            {canPublish
              ? form.is_private
                ? "Only you can see this listing."
                : "Visible in the marketplace immediately after publishing."
              : "Add a name and description to publish."}
          </span>

          {needsAuth && !token && (
            <div className="mt-2 p-4 rounded bg-surface-2 border border-border text-center">
              <p className="text-[13px] text-foreground-muted mb-3">
                Create a free account to publish this listing.
              </p>
              <Link
                href="/create-account"
                className="inline-block px-5 py-2.5 rounded font-semibold text-[13.5px] text-white"
                style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)" }}
              >
                Create an account
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
