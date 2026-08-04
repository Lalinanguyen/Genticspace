"use client";

import { useState } from "react";
import Link from "next/link";

type TraceSpan = {
  name: string;
  depth: number;
  glyph: string;
  status: string;
  output: { k: string; v: string }[];
};

const TRACE: TraceSpan[] = [
  { name: "run", depth: 0, glyph: "✦", status: "Success", output: [{ k: "Decision", v: "1 approved, 2 held for review" }, { k: "Drafts", v: "3 held for your approval, nothing sent" }] },
  { name: "qualify_requests", depth: 1, glyph: "∞", status: "Success", output: [{ k: "Ruling", v: "Split by policy match" }] },
  { name: "make_plan", depth: 2, glyph: "◆", status: "Success", output: [{ k: "Plan", v: "check status → apply policy → draft replies → stop before sending" }] },
  { name: "lookup_records", depth: 2, glyph: "ƒ", status: "Success", output: [{ k: "Status", v: "Looked up 3 records" }] },
  { name: "draft_replies", depth: 2, glyph: "◆", status: "Success", output: [{ k: "Drafts", v: "1 approval, 2 declines" }] },
  { name: "hold_for_approval", depth: 1, glyph: "‖", status: "Paused", output: [{ k: "Held", v: "Sandbox never sends. Waiting on you." }] },
];

export function HeroV3({ typedText }: { typedText: string }) {
  const [tSel, setTSel] = useState(0);
  const sel = TRACE[tSel];

  return (
    <div className="relative z-[1] max-w-[1280px] mx-auto px-8 pt-24 box-border flex flex-col items-center text-center">
      <h1 className="hero-heading relative z-[1] font-display font-normal text-[44px] md:text-[76px] leading-[1.02] tracking-[-1.8px] text-foreground max-w-[900px] mb-6 text-balance">
        Where teams find, test, and deploy AI agents
      </h1>
      <p className="relative z-[1] text-lg leading-relaxed text-foreground-muted max-w-[620px] mb-10 text-pretty">
        Search the marketplace in plain English, run any agent in a safe sandbox, and promote the
        exact same configuration to production. No engineering brief required.
      </p>

      <div className="glass-panel-lg relative z-[1] w-full max-w-[600px] flex items-center gap-3 px-5 py-[13px] rounded-2xl box-border">
        <span className="w-2 h-2 flex-none rounded-full bg-cyan" style={{ boxShadow: "0 0 8px rgba(53,192,176,.8)" }} />
        <span className="flex-1 min-w-0 text-left text-sm font-medium text-foreground-muted whitespace-nowrap overflow-hidden">
          Ask for any job, like &quot;<span className="text-foreground">{typedText}</span>
          <span className="inline-block w-[2px] h-[14px] bg-cyan-dark align-[-2px]" style={{ animation: "cursorBlink 1s steps(1) infinite" }} />
          &quot;
        </span>
        <span className="flex items-center gap-1.5 flex-none">
          <span className="glass-chip px-[9px] py-[5px] rounded-md font-mono font-semibold text-xs text-foreground/70">⌘</span>
          <span className="glass-chip px-[9px] py-[5px] rounded-md font-mono font-semibold text-xs text-foreground/70">↵</span>
          <span className="text-xs font-medium text-foreground-faint ml-0.5 whitespace-nowrap">to search</span>
        </span>
      </div>

      <div className="relative z-[1] flex gap-3 flex-wrap justify-center mt-5">
        <Link
          href="/create-account"
          className="font-bold text-sm text-[#08302B] px-[26px] py-[13px] rounded-xl whitespace-nowrap transition-transform hover:scale-[1.04]"
          style={{
            background: "linear-gradient(120deg, rgba(53,192,176,.85), rgba(53,192,176,.6) 45%, rgba(53,192,176,.8))",
            border: "1px solid rgba(255,255,255,.6)",
            boxShadow: "0 8px 24px rgba(23,140,126,.25)",
          }}
        >
          Sign up free
        </Link>
        <Link href="/sandbox" className="glass-panel-lg inline-flex items-center gap-2.5 font-bold text-sm text-foreground px-[26px] py-[13px] rounded-xl whitespace-nowrap transition-transform hover:scale-[1.04]">
          Try the sandbox <span className="text-cyan-dark">→</span>
        </Link>
      </div>

      <div className="relative w-full max-w-[1080px] mt-14">
        <div
          className="absolute pointer-events-none"
          style={{ inset: "auto 8% -30px", height: 120, background: "radial-gradient(closest-side, rgba(53,192,176,.35), transparent)", filter: "blur(30px)" }}
        />
        <div className="relative rounded-lg overflow-hidden bg-[#FDFEFC] border border-[rgba(28,38,33,.14)]" style={{ boxShadow: "0 24px 70px rgba(28,38,33,.16)" }}>
          <div
            className="relative flex items-center gap-2 px-3.5 py-2.5 border-b border-[rgba(28,38,33,.08)]"
            style={{ background: "linear-gradient(180deg,#FAFBF8,#F1F4EC)" }}
          >
            <span className="flex gap-2 flex-none">
              <span className="w-3 h-3 rounded-full bg-[#FF5F57]" />
              <span className="w-3 h-3 rounded-full bg-[#FEBC2E]" />
              <span className="w-3 h-3 rounded-full bg-[#28C840]" />
            </span>
            <span className="absolute left-1/2 -translate-x-1/2 inline-flex items-center gap-1.5 px-6 py-[5px] rounded-md bg-[rgba(28,38,33,.055)] text-xs text-foreground-muted">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="rgba(28,38,33,.5)" strokeWidth="2.4" strokeLinecap="round">
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              genticspace.com
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-4.5 py-2.5 border-b border-[rgba(28,38,33,.07)] flex-wrap text-left">
            <span className="px-1.5 py-1 rounded text-xs font-medium text-foreground-muted">Sandbox</span>
            <span className="text-[11.5px] text-foreground-faint">/</span>
            <span className="px-1.5 py-1 rounded text-xs font-medium text-foreground-muted">Your agents</span>
            <span className="text-[11.5px] text-foreground-faint">/</span>
            <span className="px-1.5 py-1 rounded text-xs font-medium text-foreground">Example run</span>
            <div className="ml-auto flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 font-mono font-semibold text-[9.5px] tracking-[.6px] text-foreground-faint">
                <span className="w-[5px] h-[5px] rounded-full bg-cyan" />
                EXAMPLE
              </span>
            </div>
          </div>
          <div className="flex min-h-[400px] text-left flex-col md:flex-row">
            <div className="flex-[1.05] min-w-0 p-6 box-border">
              <div className="flex items-center gap-2.5 mb-4">
                <span
                  className="w-[34px] h-[34px] flex-none rounded-md flex items-center justify-center font-display font-normal text-[13px] text-background"
                  style={{ background: "linear-gradient(135deg,#35C0B0,#178C7E)" }}
                >
                  ✦
                </span>
                <span className="font-display font-normal text-2xl text-foreground tracking-[-.2px]">Example agent</span>
              </div>
              <div className="flex flex-col gap-2.5">
                <div className="flex gap-2.5 p-3 rounded-md bg-[rgba(28,38,33,.03)] border border-[rgba(28,38,33,.07)]">
                  <span className="w-5 h-5 flex-none rounded font-mono font-bold text-[10px] bg-[rgba(28,38,33,.08)] text-foreground-muted flex items-center justify-center">Y</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[9.5px] tracking-[.6px] text-foreground-faint mb-1">YOU</div>
                    <div className="text-[12.5px] leading-relaxed text-foreground">
                      Here are today&apos;s open requests. Which would you handle under our policy?
                    </div>
                  </div>
                </div>
                <div className="flex gap-2.5 p-3 rounded-md bg-white border border-[rgba(28,38,33,.08)]">
                  <span className="w-5 h-5 flex-none rounded font-mono font-bold text-[10px] bg-[rgba(53,192,176,.16)] text-cyan-dark flex items-center justify-center">✦</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-[9.5px] tracking-[.6px] text-foreground-faint mb-1">AGENT</div>
                    <div className="text-[12.5px] leading-relaxed text-foreground">
                      Checked each request against policy and drafted a response for every one.
                    </div>
                    <div className="mt-2 flex gap-2 p-2.5 rounded" style={{ background: "rgba(232,163,61,.1)" }}>
                      <span className="flex-none font-mono font-bold text-[10px]" style={{ color: "#8A5B10" }}>‖</span>
                      <span className="text-[11.5px] leading-relaxed" style={{ color: "#7A5010" }}>
                        Drafts held for your approval. Nothing sends from the sandbox.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-md overflow-hidden bg-white/85 border border-[rgba(28,38,33,.12)]">
                <div className="p-3 text-[12.5px] text-foreground-faint">Ask it to do something, or paste the thing you want handled...</div>
                <div className="flex items-center gap-2 px-2.5 py-1.5 border-t border-[rgba(28,38,33,.07)]">
                  <span className="w-6 h-6 flex-none rounded border border-[rgba(28,38,33,.14)] flex items-center justify-center font-display text-[13px] text-foreground-muted">+</span>
                  <span className="ml-auto px-3.5 py-1.5 rounded bg-foreground text-background font-semibold text-[11.5px] whitespace-nowrap">Run in sandbox</span>
                </div>
              </div>
            </div>
            <div className="flex-1 min-w-0 box-border border-l border-[rgba(28,38,33,.07)]" style={{ background: "rgba(238,241,234,.35)" }}>
              <div className="flex items-center gap-0.5 px-4.5 pt-2.5">
                <span className="px-2.5 py-1.5 border-b-2 border-cyan-dark text-foreground font-semibold text-xs">Steps</span>
                <span className="px-2.5 py-1.5 border-b-2 border-transparent text-foreground-muted font-semibold text-xs">Permissions</span>
              </div>
              <div className="border-t border-[rgba(28,38,33,.07)] -mt-px" />
              <div className="px-4.5 pt-3.5 pb-0.5 flex items-center gap-2">
                <span className="font-bold text-[10px] tracking-[1.2px] text-foreground-faint">TRACE</span>
                <span className="px-2 py-0.5 rounded border border-[rgba(28,38,33,.14)] font-semibold text-[10.5px] text-foreground-muted">Waterfall</span>
              </div>
              <div className="px-3 pt-1.5 pb-2.5 flex flex-col gap-px">
                {TRACE.map((sp, i) => (
                  <button
                    type="button"
                    key={sp.name}
                    onClick={() => setTSel(i)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded text-left hover:bg-[rgba(28,38,33,.05)] transition-colors"
                    style={{ marginLeft: sp.depth * 16, background: tSel === i ? "rgba(28,38,33,.06)" : "transparent" }}
                  >
                    <span className="flex-none font-mono font-medium text-[9px] text-foreground-faint">{tSel === i ? "▾" : "▸"}</span>
                    <span className="w-[19px] h-[19px] flex-none rounded font-mono font-bold text-[10px] flex items-center justify-center" style={{ background: "rgba(53,192,176,.14)", color: "#178C7E" }}>
                      {sp.glyph}
                    </span>
                    <span className="font-semibold text-xs min-w-0 overflow-hidden text-ellipsis whitespace-nowrap" style={{ color: tSel === i ? "#1C2621" : "rgba(28,38,33,.72)" }}>
                      {sp.name}
                    </span>
                  </button>
                ))}
              </div>
              <div className="border-t border-[rgba(28,38,33,.07)] px-4.5 pt-3.5 pb-5">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 flex-none rounded-md font-mono font-bold text-[11px] flex items-center justify-center" style={{ background: "rgba(53,192,176,.16)", color: "#178C7E" }}>
                    {sel.glyph}
                  </span>
                  <span className="font-display font-normal text-[17px] text-foreground">{sel.name}</span>
                </div>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  <span className="px-2 py-0.5 rounded font-mono font-bold text-[10px]" style={{ background: "rgba(53,192,176,.14)", color: "#178C7E" }}>
                    {sel.status}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5">
                  <span className="font-mono font-medium text-[10px] text-foreground-faint">▾</span>
                  <span className="font-bold text-[12.5px] text-foreground">Output</span>
                </div>
                <div className="mt-1.5 ml-[15px] p-2.5 rounded bg-white/70 border border-[rgba(28,38,33,.09)] flex flex-col gap-1.5">
                  {sel.output.map((f) => (
                    <div key={f.k} className="flex gap-2 items-baseline">
                      <span className="flex-none font-bold text-[11.5px] text-foreground">{f.k}</span>
                      <span className="min-w-0 font-mono text-[11px] leading-relaxed text-foreground-muted">{f.v}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
