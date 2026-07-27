"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Agent } from "@/lib/types";

const RAIL_LABELS = ["Search your tool", "Browse + list", "Deploy"];
const CARD_COLORS = ["#35C0B0", "#072AC8", "#EF233C", "#E8A33D"];
const DEMO_QUERY = "reconcile invoices against our ledger";

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="glass-chip px-2.5 py-1 rounded-lg font-medium text-[10.5px]" style={{ fontFamily: "ui-monospace,Menlo,monospace", color: "rgba(28,38,33,.6)" }}>
      {children}
    </span>
  );
}

export function SpotlightClient({ agents }: { agents: Agent[] }) {
  const [active, setActive] = useState(0);
  const [searchTyped, setSearchTyped] = useState("");
  const [searchShown, setSearchShown] = useState(0);
  const refs = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  useEffect(() => {
    let cancelled = false;
    let holdTimer: ReturnType<typeof setTimeout>;

    function tick(charLen: number, shown: number) {
      if (cancelled) return;
      if (charLen < DEMO_QUERY.length) {
        setSearchTyped(DEMO_QUERY.slice(0, charLen + 1));
        holdTimer = setTimeout(() => tick(charLen + 1, shown), 45);
      } else if (shown < 3) {
        setSearchShown(shown + 1);
        holdTimer = setTimeout(() => tick(charLen, shown + 1), 360);
      } else {
        holdTimer = setTimeout(() => {
          setSearchTyped("");
          setSearchShown(0);
          tick(0, 0);
        }, 2700);
      }
    }
    tick(0, 0);
    return () => {
      cancelled = true;
      clearTimeout(holdTimer);
    };
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const idx = refs.findIndex((r) => r.current === entry.target);
            if (idx !== -1) setActive(idx);
          }
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    refs.forEach((r) => r.current && observer.observe(r.current));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchResults = agents.slice(0, 3);
  const browseAgents = agents.slice(0, 4);

  return (
    <div className="w-full bg-background">
      <div className="max-w-[1440px] mx-auto px-[5%] py-[88px] box-border flex gap-14 items-start flex-wrap relative">
        {/* RAIL */}
        <div className="flex-none w-[170px] min-w-[150px] self-stretch relative hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-3 font-medium text-[13.5px] pt-1.5" style={{ fontFamily: "ui-monospace,Menlo,monospace" }}>
            {RAIL_LABELS.map((label, i) => (
              <span
                key={label}
                className="flex items-center gap-2 pl-4 transition-colors duration-250"
                style={{ color: i === active ? "#178C7E" : "rgba(28,38,33,.4)" }}
              >
                <span className="flex-1 min-w-0">{label}</span>
                <span
                  className="w-1.5 h-1.5 rounded-full flex-none transition-colors duration-250"
                  style={{ background: i === active ? "#178C7E" : "transparent" }}
                />
              </span>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* SUBSECTION 1: SEARCH */}
          <div ref={refs[0]} className="flex gap-14 items-start flex-wrap pb-20">
            <div className="flex-1 min-w-[300px] max-w-[460px]">
              <span className="font-semibold text-xs tracking-[1.5px]" style={{ fontFamily: "ui-monospace,Menlo,monospace", color: "#178C7E" }}>
                SEARCH
              </span>
              <h2 className="mt-[18px] mb-[22px] font-display font-normal text-[44px] leading-[1.08] text-foreground tracking-[-.6px]" style={{ textWrap: "balance" }}>
                Search for your tool in plain English
              </h2>
              <p className="m-0 mb-[34px] font-body text-[16.5px] leading-[1.65] text-foreground-muted">
                Describe the job &mdash; &quot;triage my support inbox&quot;, &quot;reconcile invoices&quot; &mdash; and Genticspace matches agents by capability, not keyword. No engineering brief required.
              </p>
            </div>

            <div className="glass-panel-lg flex-1 min-w-[320px] p-[26px] rounded-2xl box-border">
              <div className="glass-chip flex items-center gap-3 px-[18px] py-3.5 rounded-[11px] mb-[22px]">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="rgba(28,38,33,.5)" strokeWidth="2" strokeLinecap="round" className="flex-none">
                  <circle cx="10" cy="10" r="5.5" />
                  <path d="M14.5 14.5L20 20" />
                </svg>
                <span className="flex-1 min-w-0 font-body text-sm text-foreground whitespace-nowrap overflow-hidden">
                  {searchTyped}
                  <span
                    className="inline-block w-0.5 h-3.5 ml-0.5 align-[-2px]"
                    style={{ background: "#178C7E", animation: "cursorBlink 1s steps(1) infinite" }}
                  />
                </span>
                <span className="font-bold text-[12.5px] text-[#08302B] bg-cyan px-4 py-2 rounded flex-none">Search</span>
              </div>
              <div className="font-semibold text-[10px] tracking-[1.5px] text-foreground-faint mb-2.5 text-center" style={{ fontFamily: "ui-monospace,Menlo,monospace" }}>
                FEATURED ON THE MARKETPLACE
              </div>
              <div className="flex flex-col gap-1.5">
                {searchResults.length === 0 && (
                  <p className="text-center text-xs text-foreground-faint py-4">No listings yet.</p>
                )}
                {searchResults.map((agent, i) => (
                  <Link
                    key={agent.tracent_id}
                    href={`/marketplace/${agent.tracent_id}`}
                    className="glass-chip flex items-center gap-2.5 px-3 py-[11px] rounded-[11px] no-underline transition-transform duration-200 hover:scale-[1.02]"
                    style={{ opacity: i < searchShown ? 1 : 0, transform: i < searchShown ? "none" : "translateY(10px)", transition: "opacity .35s ease,transform .35s ease" }}
                  >
                    <span
                      className="w-[26px] h-[26px] flex-none rounded font-display font-normal text-[10px] text-white flex items-center justify-center"
                      style={{ background: CARD_COLORS[i % CARD_COLORS.length] }}
                    >
                      {initials(agent.name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="font-display font-normal text-[13.5px] text-foreground">{agent.name || agent.tracent_id}</span>
                      {agent.industry_tags?.[0] && (
                        <span className="font-body text-[11px] text-foreground-faint"> &middot; {agent.industry_tags[0]}</span>
                      )}
                    </span>
                    {agent.verified && (
                      <span className="font-medium text-[10.5px] flex-none" style={{ fontFamily: "ui-monospace,Menlo,monospace", color: "#178C7E" }}>
                        Verified
                      </span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* SUBSECTION 2: BROWSE */}
          <div ref={refs[1]} className="flex gap-14 items-start flex-wrap py-20 border-t border-border">
            <div className="flex-1 min-w-[300px] max-w-[460px]">
              <span className="font-semibold text-xs tracking-[1.5px]" style={{ fontFamily: "ui-monospace,Menlo,monospace", color: "#178C7E" }}>
                MARKETPLACE
              </span>
              <h2 className="mt-[18px] mb-[22px] font-display font-normal text-4xl leading-[1.1] text-foreground tracking-[-.5px]" style={{ textWrap: "balance" }}>
                Browse or add what teams actually deploy
              </h2>
              <p className="m-0 mb-[34px] font-body text-[16.5px] leading-[1.65] text-foreground-muted">
                Every listing shows its license, deployment options, and verification up front &mdash; nothing buried.
              </p>
            </div>
            <div className="flex-1 min-w-[320px] flex gap-4 flex-wrap">
              {browseAgents.length === 0 && (
                <p className="text-sm text-foreground-faint">No listings yet &mdash; be the first to add one.</p>
              )}
              {browseAgents.map((agent, i) => (
                <Link
                  key={agent.tracent_id}
                  href={`/marketplace/${agent.tracent_id}`}
                  className="glass-panel-lg flex-1 min-w-[190px] overflow-hidden rounded-2xl no-underline transition-transform duration-200 hover:scale-[1.05]"
                >
                  <div className="h-[70px] relative" style={{ background: `linear-gradient(135deg,${CARD_COLORS[i % CARD_COLORS.length]},${CARD_COLORS[i % CARD_COLORS.length]}55)` }}>
                    <div
                      className="absolute left-3.5 -bottom-[18px] w-[42px] h-[42px] rounded flex items-center justify-center font-display font-normal text-[13px] text-white"
                      style={{ border: "3px solid var(--color-background)", background: `linear-gradient(135deg,${CARD_COLORS[i % CARD_COLORS.length]},${CARD_COLORS[i % CARD_COLORS.length]}bb)` }}
                    >
                      {initials(agent.name)}
                    </div>
                  </div>
                  <div className="pt-[26px] px-3.5 pb-3.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="font-display font-normal text-[15px] text-foreground">{agent.name || agent.tracent_id}</span>
                      {agent.verified && (
                        <span className="w-[15px] h-[15px] rounded-[3px] flex items-center justify-center bg-cyan text-[#08302B] text-[9px] leading-none">
                          &#10003;
                        </span>
                      )}
                    </div>
                    <div className="font-body text-[11.5px] text-foreground-faint">
                      {agent.industry_tags?.[0] || agent.source}
                      {agent.review_count ? ` · ${agent.review_count} review${agent.review_count === 1 ? "" : "s"}` : ""}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* SUBSECTION 3: DEPLOY */}
          <div ref={refs[2]} className="flex gap-14 items-start flex-wrap pt-20 border-t border-border">
            <div className="flex-1 min-w-[300px] max-w-[460px]">
              <span className="font-semibold text-xs tracking-[1.5px]" style={{ fontFamily: "ui-monospace,Menlo,monospace", color: "#178C7E" }}>
                DEPLOYMENT
              </span>
              <h2 className="mt-[18px] mb-[22px] font-display font-normal text-4xl leading-[1.1] text-foreground tracking-[-.5px]" style={{ textWrap: "balance" }}>
                From sandbox to production
              </h2>
              <p className="m-0 mb-[34px] font-body text-[16.5px] leading-[1.65] text-foreground-muted">
                Sandboxable agents clone and run their real repository in an isolated, network-locked Fly Machine &mdash; right on the listing, no install required. When it looks right, connect straight to its A2A endpoint, cloud, on-prem or API.
              </p>
            </div>
            <div className="glass-panel-lg flex-1 min-w-[320px] p-[26px] rounded-2xl box-border">
              <div className="font-semibold text-base text-foreground mb-3.5">
                Every sandboxable agent runs for real before you deploy
              </div>
              <div className="flex gap-1.5 flex-wrap mb-6">
                <Tag>A2A endpoint</Tag>
                <Tag>Sandbox runs</Tag>
                <Tag>Cloud or on-prem</Tag>
              </div>
              <div className="flex flex-col gap-2.5 mb-6">
                {[
                  ["Result", "What happened — success, failure, exit code."],
                  ["How it worked", "The full clone/build/run log stream."],
                  ["Analytics", "Real duration and log size for the run."],
                ].map(([label, desc]) => (
                  <div key={label} className="glass-chip flex items-center gap-3 px-3.5 py-2.5 rounded-[11px]">
                    <span className="font-display font-normal text-[13.5px] text-foreground flex-none w-[110px]">{label}</span>
                    <span className="font-body text-xs text-foreground-faint">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
