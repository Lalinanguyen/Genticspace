"use client";

import { usePathname, useSearchParams, useRouter } from "next/navigation";

export function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function goTo(n: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(n));
    router.push(`${pathname}?${params.toString()}`);
  }

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1).filter(
    (n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1
  );

  return (
    <div className="flex items-center justify-center gap-4.5 mt-8">
      <button
        onClick={() => goTo(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="text-foreground-muted disabled:opacity-20 font-semibold text-sm"
      >
        ←
      </button>
      <div className="flex items-center gap-3.5">
        {pages.map((n, i) => (
          <span key={n} className="flex items-center gap-3.5">
            {i > 0 && pages[i - 1] !== n - 1 && <span className="text-foreground-faint">…</span>}
            <button
              onClick={() => goTo(n)}
              className={`font-semibold text-sm cursor-pointer ${
                n === page ? "text-cyan-dark" : "text-foreground-faint"
              }`}
            >
              {n}
            </button>
          </span>
        ))}
      </div>
      <button
        onClick={() => goTo(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="text-foreground-muted disabled:opacity-20 font-semibold text-sm"
      >
        →
      </button>
    </div>
  );
}
