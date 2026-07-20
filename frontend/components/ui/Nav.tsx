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
    <div className="sticky top-0 z-20 w-full box-border grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-[5%] py-[22px] bg-[rgba(0,23,31,.55)] backdrop-blur-[22px] border-b border-border">
      <div className="flex items-center gap-2.5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] rounded bg-gradient-to-br from-blue to-cyan shadow-[0_0_22px_rgba(7,42,200,.55)]" />
          <span className="font-display font-bold text-lg text-foreground tracking-tight">
            Tracent
          </span>
        </Link>
      </div>

      <div className="flex flex-nowrap gap-5 overflow-x-auto justify-self-center font-medium text-sm text-foreground-muted whitespace-nowrap">
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

      <div className="flex gap-3 items-center flex-none justify-self-end whitespace-nowrap">
        {user ? (
          <>
            <Link
              href={`/u/${user.id}`}
              className="font-medium text-sm text-foreground-muted hover:text-foreground"
            >
              {user.name || user.company_name || user.email}
            </Link>
            <Link
              href="/settings"
              className="font-medium text-sm text-foreground-muted hover:text-foreground"
            >
              Settings
            </Link>
            <button
              onClick={logout}
              className="font-medium text-sm text-foreground-muted hover:text-foreground"
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link
              href="/create-account?mode=login"
              className="font-medium text-sm text-foreground-muted hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/create-account"
              className="px-4 py-2 rounded font-semibold text-sm text-white"
              style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)" }}
            >
              Sign up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
