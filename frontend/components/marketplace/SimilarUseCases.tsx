"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const USE_CASES = [
  "Triage support tickets",
  "Summarize contracts",
  "Reconcile transactions",
  "Screen resumes",
  "Draft sales emails",
  "Review pull requests",
  "Generate meeting notes",
];

export function SimilarUseCases({ query }: { query: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const q = query.trim().toLowerCase();
  const suggestions = USE_CASES.filter((u) => u.toLowerCase() !== q).slice(0, 5);

  function select(label: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("q", label);
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mb-6">
      <div className="font-semibold text-xs text-foreground-faint uppercase tracking-wide mb-2.5">
        Similar use cases
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((label) => (
          <span
            key={label}
            onClick={() => select(label)}
            className="glass-chip cursor-pointer px-4 py-[9px] rounded font-semibold text-[12.5px] text-foreground/75"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
