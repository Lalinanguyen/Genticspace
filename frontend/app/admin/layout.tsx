"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { getAdminStats, getStoredAdminKey, setStoredAdminKey, clearStoredAdminKey } from "@/lib/adminApi";

const inputClass =
  "w-full box-border px-3.5 py-2.5 rounded bg-[rgba(244,247,243,.06)] border border-border-strong text-foreground text-sm focus:outline-none focus:border-cyan";

const NAV_LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/reviews", label: "Reviews" },
  { href: "/admin/flags", label: "Flags" },
  { href: "/admin/verifications", label: "Verifications" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/sandbox", label: "Sandbox" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [keyInput, setKeyInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (!getStoredAdminKey()) {
      Promise.resolve().then(() => setChecking(false));
      return;
    }
    getAdminStats()
      .then(() => setAuthorized(true))
      .catch(() => clearStoredAdminKey())
      .finally(() => setChecking(false));
  }, []);

  async function tryKey() {
    setError(null);
    setStoredAdminKey(keyInput.trim());
    try {
      await getAdminStats();
      setAuthorized(true);
    } catch {
      clearStoredAdminKey();
      setError("That key was rejected.");
    }
  }

  if (checking) return null;

  if (!authorized) {
    return (
      <div className="flex flex-col min-h-screen">
        <Nav />
        <main className="flex-1 w-full max-w-[420px] mx-auto px-[5%] py-16 box-border">
          <h1 className="font-display font-bold text-[24px] text-foreground mb-1.5">Admin</h1>
          <p className="text-foreground-muted text-sm mb-6">Enter the admin API key to continue.</p>
          <input
            type="password"
            className={inputClass}
            placeholder="Admin key"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && tryKey()}
          />
          {error && <p className="text-error text-[12.5px] font-semibold mt-2">{error}</p>}
          <div
            onClick={tryKey}
            className="mt-4 self-start inline-block px-6 py-3 rounded font-semibold text-sm cursor-pointer text-white"
            style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" }}
          >
            Continue
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[900px] mx-auto px-[5%] py-12 box-border">
        <h1 className="font-display font-bold text-[30px] text-foreground mb-1.5">Admin</h1>
        <p className="text-foreground-muted text-sm mb-8">Moderation and trust actions.</p>

        <div className="flex gap-1 mb-8 border-b border-border overflow-x-auto">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="px-4 py-2.5 font-semibold text-[13px] cursor-pointer whitespace-nowrap"
              style={{
                color: pathname === link.href ? "#F4F7F3" : "rgba(244,247,243,.5)",
                borderBottom: pathname === link.href ? "2px solid #35C0B0" : "2px solid transparent",
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {children}
      </main>
      <Footer />
    </div>
  );
}
