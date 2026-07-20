"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PROTOCOL_OPTIONS = [
  { key: "a2a_only", label: "A2A" },
  { key: "mcp_only", label: "MCP" },
  { key: "x402_only", label: "x402" },
] as const;

const TRUST_TIERS = [
  { value: "", label: "Any" },
  { value: "onchain", label: "On-chain" },
  { value: "tracent", label: "Tracent-verified" },
];

const INDUSTRIES = [
  "Healthcare", "Customer Support", "Finance & Fintech", "Legal",
  "Retail & E-commerce", "Marketing", "Software Engineering", "Education",
  "HR & Recruiting", "Real Estate", "Manufacturing", "Travel & Hospitality",
  "Insurance", "Media & Entertainment", "Logistics & Supply Chain",
  "Agriculture", "Sports & Fitness",
];

const LICENSES = ["Open Source", "Commercial", "Freemium", "Enterprise"];
const DEPLOYMENTS = ["Cloud", "On-prem", "API"];

export function FilterSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null || value === "" || value === "false") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  function toggleBool(key: string) {
    const current = searchParams.get(key) === "true";
    updateParam(key, current ? null : "true");
  }

  function toggleInList(key: string, value: string) {
    const current = (searchParams.get(key) || "").split(",").filter(Boolean);
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    updateParam(key, next.length ? next.join(",") : null);
  }

  function reset() {
    router.push(pathname);
  }

  const verifiedOnly = searchParams.get("verified") === "true";
  const trustTier = searchParams.get("trust_tier") || "";
  const safeOnly = searchParams.get("safe_only") === "true";
  const activeIndustries = (searchParams.get("industry") || "").split(",").filter(Boolean);
  const activeLicenses = (searchParams.get("license") || "").split(",").filter(Boolean);
  const activeDeployments = (searchParams.get("deployment") || "").split(",").filter(Boolean);

  return (
    <div className="flex-none w-[240px] min-w-[220px] flex flex-col gap-7">
      <div className="flex items-center justify-between">
        <span className="font-display font-bold text-sm text-foreground">Filters</span>
        <button onClick={reset} className="font-semibold text-[12.5px] text-cyan">
          Reset
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3.5 rounded bg-surface border border-border">
        <span className="font-semibold text-[13px] text-foreground">Verified only</span>
        <button
          onClick={() => toggleBool("verified")}
          className="w-[38px] h-[22px] rounded-sm flex-none relative"
          style={{ background: verifiedOnly ? "#35C0B0" : "rgba(244,247,243,.15)" }}
        >
          <span
            className="absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white transition-all"
            style={{ left: verifiedOnly ? "18px" : "2px" }}
          />
        </button>
      </div>

      <div className="flex items-center justify-between px-4 py-3.5 rounded bg-surface border border-border">
        <span className="font-semibold text-[13px] text-foreground">Safe to transact</span>
        <button
          onClick={() => toggleBool("safe_only")}
          className="w-[38px] h-[22px] rounded-sm flex-none relative"
          style={{ background: safeOnly ? "#35C0B0" : "rgba(244,247,243,.15)" }}
        >
          <span
            className="absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white transition-all"
            style={{ left: safeOnly ? "18px" : "2px" }}
          />
        </button>
      </div>

      <div>
        <div className="font-bold text-[12.5px] text-foreground-faint uppercase tracking-wide mb-3">
          Trust tier
        </div>
        <select
          value={trustTier}
          onChange={(e) => updateParam("trust_tier", e.target.value)}
          className="w-full px-3.5 py-2.5 rounded bg-surface border border-border-strong text-foreground text-[13px] font-medium"
        >
          {TRUST_TIERS.map((t) => (
            <option key={t.value} value={t.value} className="bg-[#0A1620]">
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <CheckboxGroup
        label="Industry"
        options={INDUSTRIES}
        active={activeIndustries}
        onToggle={(v) => toggleInList("industry", v)}
      />

      <div>
        <div className="font-bold text-[12.5px] text-foreground-faint uppercase tracking-wide mb-3">
          Protocol support
        </div>
        <div className="flex flex-col gap-2.5">
          {PROTOCOL_OPTIONS.map((opt) => {
            const checked = searchParams.get(opt.key) === "true";
            return (
              <label key={opt.key} className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleBool(opt.key)}
                  className="w-4 h-4 accent-cyan"
                />
                <span className={checked ? "text-foreground text-[13px] font-medium" : "text-foreground-muted text-[13px] font-medium"}>
                  {opt.label}
                </span>
              </label>
            );
          })}
        </div>
      </div>

      <CheckboxGroup
        label="Licensing"
        options={LICENSES}
        active={activeLicenses}
        onToggle={(v) => toggleInList("license", v)}
      />

      <CheckboxGroup
        label="Deployment"
        options={DEPLOYMENTS}
        active={activeDeployments}
        onToggle={(v) => toggleInList("deployment", v)}
      />
    </div>
  );
}

function CheckboxGroup({
  label,
  options,
  active,
  onToggle,
}: {
  label: string;
  options: string[];
  active: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div className="font-bold text-[12.5px] text-foreground-faint uppercase tracking-wide mb-3">
        {label}
      </div>
      <div className="flex flex-col gap-2.5">
        {options.map((opt) => {
          const checked = active.includes(opt);
          return (
            <label key={opt} className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(opt)}
                className="w-4 h-4 accent-cyan flex-none"
              />
              <span className={checked ? "text-foreground text-[13px] font-medium" : "text-foreground-muted text-[13px] font-medium"}>
                {opt}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
