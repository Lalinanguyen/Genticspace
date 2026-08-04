"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { IndustryFilter } from "./IndustryFilter";
import { SandboxableFilter } from "./SandboxableFilter";

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const anyFilter = !!(
    searchParams.get("q") ||
    searchParams.get("industry") ||
    searchParams.get("sandboxable_only")
  );

  function reset() {
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 px-[5%] pt-3.5 pb-5 box-border border-b border-border">
      <IndustryFilter />
      <SandboxableFilter />
      {anyFilter && (
        <span onClick={reset} className="cursor-pointer px-2 py-2 font-semibold text-[13px] text-cyan-dark">
          Clear
        </span>
      )}
    </div>
  );
}
