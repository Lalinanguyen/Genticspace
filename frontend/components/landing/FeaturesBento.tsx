"use client";

import { useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Agent } from "@/lib/types";
import { agentId } from "@/lib/agent";
import { agentColor } from "@/lib/agentColor";
import { GlobeCanvas, type GlobeHandle } from "./GlobeCanvas";

const CHECKS = [
  "Builder identity confirmed",
  "License terms match the listing",
  "Deployment claims tested in-sandbox",
];

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const SLIDE_POS: { anchor: CSSProperties; base: string; off: string }[] = [
  { anchor: { left: 0, top: "26%" }, base: "translateY(-50%)", off: "translateY(-50%) translateX(26px)" },
  { anchor: { right: 0, top: "56%" }, base: "translateY(-50%)", off: "translateY(-50%) translateX(-26px)" },
  { anchor: { left: "50%", bottom: 0 }, base: "translateX(-50%)", off: "translateX(-50%) translateY(-22px)" },
];

function slideStyle(i: number, active: number): CSSProperties {
  const pos = SLIDE_POS[i];
  const common: CSSProperties = {
    position: "absolute",
    zIndex: 2,
    width: "min(420px,92%)",
    ...pos.anchor,
    boxShadow: "0 22px 60px rgba(28,38,33,.16)",
    borderRadius: 8,
    transition: "opacity .45s ease, transform .45s ease",
  };
  return active === i
    ? { ...common, opacity: 1, transform: pos.base }
    : { ...common, opacity: 0, transform: pos.off, pointerEvents: "none" };
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg box-border flex flex-col gap-5 p-8"
      style={{ border: "1px solid rgba(28,38,33,.12)", background: "#F7F9F3" }}
    >
      {children}
    </div>
  );
}

export function FeaturesBento({ typedText, matches }: { typedText: string; matches: Agent[] }) {
  const [slide, setSlide] = useState(0);
  const globeRef = useRef<GlobeHandle>(null);

  const goTo = (i: number) => {
    if (globeRef.current) globeRef.current.focus(i);
    else setSlide(i);
  };

  return (
    <div className="relative z-[1] max-w-[1280px] mx-auto px-8 pt-24 pb-16 box-border">
      <span className="font-mono font-semibold text-xs tracking-[1.5px] text-cyan-dark">FOR TEAMS SEARCHING</span>
      <h2 className="hero-heading font-display font-normal text-[48px] leading-[1.08] tracking-[-.8px] max-w-[640px] mt-4 mb-12 text-balance">
        The shortest path from &quot;we need this&quot; to deployed
      </h2>

      <div className="relative min-h-[680px] flex justify-center items-start">
        <GlobeCanvas ref={globeRef} activeIndex={slide} onActiveChange={setSlide} />

        <div style={slideStyle(0, slide)}>
          <Card>
            <div>
              <h3 className="font-display font-normal text-[26px] tracking-[-.3px] mb-2">Search in plain English</h3>
              <p className="text-[15px] leading-relaxed text-foreground-muted">
                Describe the job and Genticspace matches agents by capability, not keyword.
              </p>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-3 rounded bg-white border border-[rgba(28,38,33,.12)]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(28,38,33,.5)" strokeWidth="2" strokeLinecap="round" className="flex-none">
                <circle cx="10" cy="10" r="5.5" />
                <path d="M14.5 14.5L20 20" />
              </svg>
              <span className="flex-1 min-w-0 text-sm text-foreground whitespace-nowrap overflow-hidden">
                {typedText}
                <span className="inline-block w-[2px] h-[14px] bg-cyan-dark ml-0.5 align-[-2px]" style={{ animation: "cursorBlink 1s steps(1) infinite" }} />
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {matches.length === 0 && (
                <p className="text-xs text-foreground-faint text-center py-3">No live matches right now.</p>
              )}
              {matches.map((agent) => {
                const id = agentId(agent);
                const color = agentColor(id || agent.name || "agent");
                const label = agent.name || id;
                return (
                  <Link
                    key={id}
                    href={`/marketplace/${id}`}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded bg-white border border-[rgba(28,38,33,.09)] hover:bg-cyan/6 transition-colors"
                  >
                    {agent.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={agent.image_url}
                        alt=""
                        className="w-[26px] h-[26px] rounded flex-none object-cover"
                      />
                    ) : (
                      <span
                        className="w-[26px] h-[26px] rounded flex-none flex items-center justify-center font-display font-normal text-[10px] text-white"
                        style={{ background: `linear-gradient(135deg, ${color}, ${color}bb)` }}
                      >
                        {initials(label)}
                      </span>
                    )}
                    <span className="flex-1 min-w-0">
                      <span className="font-display font-normal text-[13.5px] text-foreground">{label}</span>
                      {agent.industry_tags?.[0] && (
                        <span className="text-[11px] text-foreground-faint"> · {agent.industry_tags[0]}</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>

        <div style={slideStyle(2, slide)}>
          <Card>
            <div>
              <h3 className="font-display font-normal text-[26px] tracking-[-.3px] mb-2">Trial in a safe sandbox</h3>
              <p className="text-[15px] leading-relaxed text-foreground-muted">
                Run a sandboxable agent on your real work before you commit. Connections are
                read-only, and every step is traced.
              </p>
            </div>
            <div className="rounded-md overflow-hidden bg-white border border-[rgba(28,38,33,.1)]">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[rgba(28,38,33,.07)] text-[11.5px] font-medium text-foreground-muted">
                <span>Sandbox</span>
                <span className="text-foreground-faint">/</span>
                <span>Example run</span>
                <span className="ml-auto inline-flex items-center gap-1.5 font-mono font-semibold text-[9.5px] tracking-[.6px] text-foreground-faint">
                  <span className="w-[5px] h-[5px] rounded-full bg-cyan" />
                  EXAMPLE
                </span>
              </div>
              <div className="p-3.5">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2.5 px-1.5 py-1 rounded">
                    <span className="flex-none w-[88px] text-[11.5px] font-medium text-foreground-faint">Connections</span>
                    <span className="text-[11.5px] font-semibold text-foreground">Read-only</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-1.5 py-1 rounded">
                    <span className="flex-none w-[88px] text-[11.5px] font-medium text-foreground-faint">Trace</span>
                    <span className="text-[11.5px] font-semibold text-foreground">Every step inspectable</span>
                  </div>
                  <div className="flex items-center gap-2.5 px-1.5 py-1 rounded">
                    <span className="flex-none w-[88px] text-[11.5px] font-medium text-foreground-faint">Outbound</span>
                    <span className="text-[11.5px] font-semibold text-cyan-dark">Held for approval</span>
                  </div>
                </div>
              </div>
            </div>
            <Link href="/sandbox" className="font-bold text-[13.5px] text-cyan-dark mt-auto">
              Open the sandbox →
            </Link>
          </Card>
        </div>

        <div style={slideStyle(1, slide)}>
          <Card>
            <div>
              <h3 className="font-display font-normal text-[26px] tracking-[-.3px] mb-2">Verified before it&apos;s listed</h3>
              <p className="text-[15px] leading-relaxed text-foreground-muted">
                Identity, licensing, and deployment claims are cross-checked against public agent
                registries before any listing goes live.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              {CHECKS.map((c) => (
                <div key={c} className="flex items-center gap-2.5 px-3 py-2.5 rounded bg-white border border-[rgba(28,38,33,.09)]">
                  <span className="w-4 h-4 rounded-sm flex-none flex items-center justify-center bg-cyan text-[#08302B] text-[9.5px] leading-none">✓</span>
                  <span className="font-semibold text-[12.5px] text-foreground/75">{c}</span>
                </div>
              ))}
            </div>
            <Link href="/sandbox" className="font-bold text-[13.5px] text-cyan-dark mt-auto">
              Open the sandbox →
            </Link>
          </Card>
        </div>
      </div>

      <div className="flex flex-col items-center gap-2.5 mt-2">
        <div className="flex gap-4 justify-center items-center">
          <button
            type="button"
            aria-label="Previous"
            onClick={() => goTo((slide + 2) % 3)}
            className="w-9 h-9 rounded-full border border-[rgba(28,38,33,.25)] bg-white/60 flex items-center justify-center text-foreground hover:bg-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <div className="flex gap-2 items-center">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                type="button"
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => goTo(i)}
                className="w-[9px] h-[9px] rounded-full transition-colors"
                style={{ background: slide === i ? "#178C7E" : "rgba(28,38,33,.18)" }}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Next"
            onClick={() => goTo((slide + 1) % 3)}
            className="w-9 h-9 rounded-full border border-[rgba(28,38,33,.25)] bg-white/60 flex items-center justify-center text-foreground hover:bg-white transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <span className="font-medium text-[12.5px] text-foreground-faint">
          Drag the globe to explore — click a hub to open its step.
        </span>
      </div>
    </div>
  );
}
