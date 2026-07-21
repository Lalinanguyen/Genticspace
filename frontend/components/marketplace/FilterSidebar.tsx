"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PROTOCOL_OPTIONS = [
  { key: "a2a_only", label: "A2A" },
  { key: "mcp_only", label: "MCP" },
  { key: "x402_only", label: "x402" },
] as const;

const TRUST_TIERS = [
  { value: "", label: "Any tier" },
  { value: "onchain", label: "On-chain" },
  { value: "tracent", label: "Genticspace-verified" },
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

const VISIBLE_INDUSTRY_COUNT = 7;

const chipBase =
  "px-3.5 py-1.5 rounded-full border font-semibold text-[12.5px] whitespace-nowrap transition-colors";
const chipActive = `${chipBase} border-cyan bg-cyan/14 text-cyan`;
const chipInactive = `${chipBase} border-border bg-surface text-foreground-muted hover:border-border-strong hover:text-foreground`;

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={active ? chipActive : chipInactive}>
      {children}
    </button>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-bold text-[11px] text-foreground-faint uppercase tracking-wide">{label}</span>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function FilterSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showMore, setShowMore] = useState(false);
  const [showAllIndustries, setShowAllIndustries] = useState(false);

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
    setShowMore(false);
    router.push(pathname);
  }

  const verifiedOnly = searchParams.get("verified") === "true";
  const trustTier = searchParams.get("trust_tier") || "";
  const safeOnly = searchParams.get("safe_only") === "true";
  const activeIndustries = (searchParams.get("industry") || "").split(",").filter(Boolean);
  const activeLicenses = (searchParams.get("license") || "").split(",").filter(Boolean);
  const activeDeployments = (searchParams.get("deployment") || "").split(",").filter(Boolean);
  const activeProtocols = PROTOCOL_OPTIONS.filter((o) => searchParams.get(o.key) === "true");

  const moreActiveCount = activeProtocols.length + activeLicenses.length + activeDeployments.length;
  const hasAnyFilter =
    verifiedOnly || safeOnly || !!trustTier || activeIndustries.length > 0 || moreActiveCount > 0;

  const visibleIndustries = showAllIndustries ? INDUSTRIES : INDUSTRIES.slice(0, VISIBLE_INDUSTRY_COUNT);
  const hiddenIndustryCount = INDUSTRIES.length - VISIBLE_INDUSTRY_COUNT;

  return (
    <div className="w-full flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Chip active={verifiedOnly} onClick={() => toggleBool("verified")}>
          {verifiedOnly ? "✓ Verified" : "Verified"}
        </Chip>
        <Chip active={safeOnly} onClick={() => toggleBool("safe_only")}>
          Safe to transact
        </Chip>
        <select
          value={trustTier}
          onChange={(e) => updateParam("trust_tier", e.target.value)}
          className={`${trustTier ? chipActive : chipInactive} cursor-pointer`}
        >
          {TRUST_TIERS.map((t) => (
            <option key={t.value} value={t.value} className="bg-[#0A1620] text-foreground">
              {t.label}
            </option>
          ))}
        </select>

        <span className="w-px h-5 bg-border mx-0.5 flex-none" />

        {visibleIndustries.map((industry) => (
          <Chip
            key={industry}
            active={activeIndustries.includes(industry)}
            onClick={() => toggleInList("industry", industry)}
          >
            {industry}
          </Chip>
        ))}
        {!showAllIndustries && hiddenIndustryCount > 0 && (
          <button
            type="button"
            onClick={() => setShowAllIndustries(true)}
            className="px-3.5 py-1.5 rounded-full border border-dashed border-border-strong font-semibold text-[12.5px] text-cyan whitespace-nowrap"
          >
            +{hiddenIndustryCount} more
          </button>
        )}

        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className={moreActiveCount > 0 ? chipActive : `${chipInactive} border-dashed`}
        >
          More filters{moreActiveCount > 0 ? ` (${moreActiveCount})` : ""} {showMore ? "▲" : "▾"}
        </button>

        {hasAnyFilter && (
          <button
            type="button"
            onClick={reset}
            className="ml-auto font-semibold text-[12.5px] text-foreground-faint hover:text-cyan"
          >
            Clear
          </button>
        )}
      </div>

      {showMore && (
        <div className="flex flex-wrap gap-x-8 gap-y-4 p-4 rounded bg-surface border border-border">
          <FilterGroup label="Protocol">
            {PROTOCOL_OPTIONS.map((opt) => (
              <Chip key={opt.key} active={searchParams.get(opt.key) === "true"} onClick={() => toggleBool(opt.key)}>
                {opt.label}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Licensing">
            {LICENSES.map((license) => (
              <Chip
                key={license}
                active={activeLicenses.includes(license)}
                onClick={() => toggleInList("license", license)}
              >
                {license}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Deployment">
            {DEPLOYMENTS.map((deployment) => (
              <Chip
                key={deployment}
                active={activeDeployments.includes(deployment)}
                onClick={() => toggleInList("deployment", deployment)}
              >
                {deployment}
              </Chip>
            ))}
          </FilterGroup>
        </div>
      )}
    </div>
  );
}
