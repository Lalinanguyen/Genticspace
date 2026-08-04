"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SandboxableFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const checked = searchParams.get("sandboxable_only") === "true";

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (checked) params.delete("sandboxable_only");
    else params.set("sandboxable_only", "true");
    params.delete("page");
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <label className="glass-chip flex items-center gap-2 px-[14px] py-[11px] rounded text-foreground font-semibold text-[13px] cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={toggle} className="accent-cyan" />
      Try it now
    </label>
  );
}
