"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function SearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const [value, setValue] = useState(q);
  const [syncedQ, setSyncedQ] = useState(q);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Keep the input in sync when `q` changes from outside this component
  // (e.g. browser back/forward, or another filter resetting it) without
  // clobbering it every render, or during the local debounce window above.
  if (q !== syncedQ) {
    setSyncedQ(q);
    setValue(q);
  }

  function handleChange(next: string) {
    setValue(next);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next) params.set("q", next);
      else params.delete("q");
      params.delete("page");
      router.push(`${pathname}?${params.toString()}`);
    }, 400);
  }

  return (
    <div className="glass-panel flex items-center gap-3 px-5 py-[15px] rounded max-w-[640px]">
      <div className="relative w-[18px] h-[18px] border-2 border-foreground/45 rounded-full flex-none">
        <div className="absolute -bottom-[7px] -right-[7px] w-2 h-0.5 bg-foreground/45 rotate-45" />
      </div>
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder='Try "summarize customer emails"...'
        className="flex-1 border-none outline-none bg-transparent text-[15px] text-foreground placeholder:text-foreground-faint"
      />
    </div>
  );
}
