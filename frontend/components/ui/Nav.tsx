"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/contribute", label: "Contribute" },
];

export function Nav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div
      className="sticky top-0 z-20 w-full box-border flex flex-wrap gap-4 items-center justify-between px-[5%] py-3.5 relative overflow-hidden"
      style={{
        background: "linear-gradient(120deg, rgba(238,241,234,.5), rgba(238,241,234,.22) 40%, rgba(238,241,234,.45))",
        backdropFilter: "blur(30px) saturate(1.9) contrast(1.05)",
        WebkitBackdropFilter: "blur(30px) saturate(1.9) contrast(1.05)",
        border: "1px solid rgba(255,255,255,.45)",
        boxShadow:
          "0 4px 14px rgba(28,38,33,.06), inset 0 1.5px 1px rgba(255,255,255,.75), inset 1.5px 0 1px rgba(255,255,255,.4), inset 0 -1.5px 1px rgba(28,38,33,.07), inset -1.5px 0 1px rgba(28,38,33,.04)",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,.35) 44%, rgba(255,255,255,.08) 50%, transparent 62%)",
        }}
      />
      <div className="flex items-center gap-2.5 flex-none relative">
        <Link href="/" className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="Genticspace" className="w-[30px] h-[30px] object-contain" />
          <span className="font-display font-normal text-xl text-foreground tracking-tight">
            Genticspace
          </span>
        </Link>
      </div>

      <div className="flex flex-nowrap gap-6 overflow-x-auto no-scrollbar font-semibold text-sm text-foreground-muted whitespace-nowrap min-w-0">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={
                active
                  ? "flex-none text-foreground pb-1 border-b-2 border-cyan"
                  : "flex-none text-inherit hover:text-foreground"
              }
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      <div className="flex gap-3 items-center flex-none whitespace-nowrap">
        {user ? (
          <>
            <Link
              href={`/u/${user.id}`}
              className="font-semibold text-sm text-foreground hover:text-cyan-dark"
            >
              {user.name || user.company_name || user.email}
            </Link>
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex items-center text-foreground hover:text-cyan-dark"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
            <button
              onClick={logout}
              className="font-semibold text-sm text-foreground hover:text-cyan-dark"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/create-account?mode=login" className="font-semibold text-sm text-foreground">
              Sign in
            </Link>
            <Link
              href="/create-account"
              className="px-4 py-[9px] rounded bg-cyan font-bold text-[13.5px] text-[#08302B]"
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
