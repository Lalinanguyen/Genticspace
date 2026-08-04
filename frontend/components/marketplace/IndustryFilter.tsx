"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const INDUSTRIES = [
  "Healthcare", "Customer Support", "Finance & Fintech", "Legal",
  "Retail & E-commerce", "Marketing", "Software Engineering", "Education",
  "HR & Recruiting", "Real Estate", "Manufacturing", "Travel & Hospitality",
  "Insurance", "Media & Entertainment", "Logistics & Supply Chain",
  "Agriculture", "Sports & Fitness",
];

export function IndustryFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const industry = searchParams.get("industry") || "";

  function handleChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set("industry", next);
    else params.delete("industry");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={industry}
      onChange={(e) => handleChange(e.target.value)}
      className="glass-chip px-[18px] py-[11px] rounded text-foreground font-semibold text-[13px] cursor-pointer min-w-[260px]"
    >
      <option value="">All industries</option>
      {INDUSTRIES.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
