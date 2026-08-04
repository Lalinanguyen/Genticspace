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
          "0 12px 40px rgba(28,38,33,.12), inset 0 1.5px 1px rgba(255,255,255,.75), inset 1.5px 0 1px rgba(255,255,255,.4), inset 0 -1.5px 1px rgba(28,38,33,.07), inset -1.5px 0 1px rgba(28,38,33,.04)",
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
          <img src="/assets/bubble-logo.svg" alt="Genticspace" className="w-[30px] h-[30px] object-contain" />
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
              className="font-semibold text-sm text-foreground hover:text-cyan-dark"
            >
              Settings
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
