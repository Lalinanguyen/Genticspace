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
    <div className="flex items-center gap-2.5 px-[18px] py-[15px] rounded bg-[rgba(244,247,243,.06)] border border-border">
      <svg width="17" height="17" viewBox="0 0 24 24" className="flex-none text-foreground-faint">
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
        <line x1="21" y1="21" x2="15" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder='Try "summarize customer emails"...'
        className="flex-1 border-none outline-none bg-transparent text-[15px] text-foreground placeholder:text-foreground-faint"
      />
    </div>
  );
}
