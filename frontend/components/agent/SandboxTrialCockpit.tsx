"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * Ported verbatim from the imported design (Sandbox v2.dc.html): a fully
 * scripted "try an agent in sandbox" cockpit -- fixed demo agent ("Atlas
 * Vision"), a canned two-turn conversation, and fabricated steps/permissions/
 * scorecard data. Unlike RunConsole.tsx (the real Run console, which drops
 * fabricated content because it has no execution backend to back it with),
 * this page is kept as a standalone illustrative mock exactly as designed --
 * it is not wired to any agent, run, or backend.
 */

const AGENT_NAME = "Atlas Vision";
const AVATAR_INITIALS = "AV";
const RUN_LIMIT = 50;

type Msg = { who: "you" | "agent"; tag: string; text: string; flag?: string };

const BASE_MESSAGES: Msg[] = [
  {
    who: "you",
    tag: "YOU",
    text: "Three customers say their order never arrived. Decide who gets a refund and draft the replies. Policy is attached.",
  },
  {
    who: "agent",
    tag: "ATLAS VISION",
    text:
      "I checked all three orders against your policy.\n\n" +
      "• 8862 was lost in transit, so it qualifies for a full refund. Approval reply drafted.\n" +
      "• 8841 and 8903 were delivered with no damage claim, so I drafted a polite decline quoting the policy line.\n\n" +
      "Nothing was sent. Three drafts are waiting for you.",
    flag: "I paused on 8903: the customer mentions a second charge I could not verify from what you gave me. In production this is where a human review rule would kick in.",
  },
];

const EXTRA_MESSAGES: Msg[] = [
  { who: "you", tag: "YOU", text: "Redo 8903 assuming the second charge is real." },
  {
    who: "agent",
    tag: "ATLAS VISION",
    text:
      "Updated. With a duplicate charge confirmed, 8903 becomes a refund of the duplicate only, not the order. New draft apologises for the double charge and gives a 3 to 5 day window.\n\nStill nothing sent.",
  },
];

type Tone = "ink" | "blue" | "teal" | "amber";
type Step = { name: string; dur: string; tone: Tone; detail: string };

const STEPS: Step[] = [
  { name: "Read the request", dur: "12ms", tone: "ink", detail: "3 customer messages, 1 attached PDF (refund_policy.pdf)" },
  {
    name: "Made a plan",
    dur: "740ms",
    tone: "blue",
    detail: "Check each order status → apply policy → draft one reply per customer → stop before sending.",
  },
  {
    name: "Looked up order status",
    dur: "310ms",
    tone: "teal",
    detail: "orders.lookup(ids=[8841, 8862, 8903])\n→ 8841 delivered · 8862 lost in transit · 8903 delivered",
  },
  {
    name: "Read your policy",
    dur: "180ms",
    tone: "teal",
    detail: '2 passages matched:\n"lost in transit → full refund"\n"delivered, no damage claim → no refund"',
  },
  { name: "Wrote the replies", dur: "820ms", tone: "blue", detail: "1 approval, 2 declines. Tone sampled from 6 of your past replies." },
  { name: "Stopped for your approval", dur: "-", tone: "amber", detail: "Sandbox never sends. Drafts held in this workspace only." },
];

const TONE_COLORS: Record<Tone, string> = {
  ink: "#8FA79B",
  blue: "#7A93F5",
  teal: "#6BD9CB",
  amber: "#E8A33D",
};

type Check = { name: string; ok: boolean; result: string };

const CHECKS: Check[] = [
  { name: "Followed your policy", ok: true, result: "24/24" },
  { name: "Right order every time", ok: true, result: "24/24" },
  { name: "Never invented a fact", ok: true, result: "23/24" },
  { name: "Tone matched yours", ok: true, result: "22/24" },
  { name: "Asked when unsure", ok: false, result: "19/24" },
];

type Perm = { name: string; note: string; state: string; ok: boolean | null };

const PERMS: Perm[] = [
  { name: "Read order records", note: "Copies only, in this sandbox", state: "USED", ok: true },
  { name: "Read files you attach", note: "1 PDF this session", state: "USED", ok: true },
  { name: "Draft emails", note: "Written, never sent", state: "HELD", ok: null },
  { name: "Send email / issue refunds", note: "Blocked in sandbox", state: "BLOCKED", ok: false },
];

const SAMPLES = ["Redo 8903 with the duplicate charge", "Show me the declined replies", "What would it do without my policy?"];

const PANES: [string, string][] = [
  ["steps", "Every step"],
  ["perms", "Access"],
  ["score", "Scorecard"],
];

const VERDICT_STATS = [
  { k: "Scorecard", v: "92%", color: "#178C7E" },
  { k: "Runs used", v: `18 / ${RUN_LIMIT}`, color: "#1C2621" },
  { k: "Sandbox left", v: "6 days", color: "#1C2621" },
  { k: "Cost", v: "$0.00", color: "#1C2621" },
];

function messageStyle(m: Msg) {
  const isYou = m.who === "you";
  return {
    alignSelf: isYou ? "flex-end" : "flex-start",
    maxWidth: "86%",
    borderRadius: isYou ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
    background: isYou ? "#1C2621" : "linear-gradient(120deg,rgba(255,255,255,.6),rgba(238,241,234,.3))",
    border: isYou ? "1px solid #1C2621" : "1px solid rgba(255,255,255,.75)",
    color: isYou ? "rgba(238,241,234,.92)" : "#1C2621",
  } as const;
}

function tagColor(m: Msg): string {
  return m.who === "you" ? "rgba(238,241,234,.5)" : "#178C7E";
}

export function SandboxTrialCockpit() {
  const [pane, setPane] = useState<"steps" | "perms" | "score">("steps");
  const [input, setInput] = useState("");
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [sent, setSent] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [openStep, setOpenStep] = useState(2);
  const [reset, setReset] = useState(false);
  const [declined, setDeclined] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    },
    []
  );

  const messages = sent ? BASE_MESSAGES.concat(EXTRA_MESSAGES) : BASE_MESSAGES;
  const sessionMeta = `${messages.length} turns · 2 runs today`;
  const fileNote = fileNames.length ? fileNames.join(", ") : "refund_policy.pdf attached";

  function send() {
    if (sent) return;
    setThinking(true);
    setInput("");
    timeoutRef.current = setTimeout(() => {
      setThinking(false);
      setSent(true);
    }, 900);
  }

  function handleReset() {
    setSent(false);
    setOpenStep(2);
    setReset((r) => !r);
  }

  return (
    <div>
      {/* SESSION BAR */}
      <div className="py-7 pb-5 flex items-center justify-between gap-5 flex-wrap">
        <div className="flex items-center gap-3.5 flex-wrap">
          <div
            className="w-[46px] h-[46px] flex-none rounded-lg text-background flex items-center justify-center font-display font-normal text-[17px]"
            style={{ background: "linear-gradient(140deg,#178C7E,#072AC8)" }}
          >
            {AVATAR_INITIALS}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="m-0 font-display font-normal text-[27px] tracking-[-.3px] text-foreground">{AGENT_NAME}</h1>
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono font-bold text-[9.5px] tracking-[.7px]"
                style={{ background: "rgba(232,163,61,.14)", border: "1px solid rgba(232,163,61,.4)", color: "#8A5B10" }}
              >
                <span className="w-[5px] h-[5px] rounded-full bg-amber animate-[v2Dot_1.4s_ease-in-out_infinite]" />
                HOSTED IN SANDBOX
              </span>
            </div>
            <div className="mt-1 text-[12.5px] text-foreground-faint">
              Trial workspace, expires in 6 days. It cannot send, pay or write anything.
            </div>
          </div>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <div
            onClick={handleReset}
            className="glass-chip px-4 py-2.5 rounded-[10px] font-semibold text-[12.5px] text-foreground-muted cursor-pointer"
          >
            {reset ? "✓ Sandbox cleared" : "Reset sandbox"}
          </div>
          <Link
            href="/marketplace"
            className="glass-chip px-4 py-2.5 rounded-[10px] font-semibold text-[12.5px] text-foreground-muted no-underline"
          >
            Dashboard view
          </Link>
        </div>
      </div>

      {/* SPLIT COCKPIT */}
      <div className="flex gap-[18px] items-stretch flex-wrap pb-[120px]">
        {/* LEFT: CONVERSATION */}
        <div className="glass-panel flex-1 basis-[440px] min-w-[320px] box-border flex flex-col rounded-xl overflow-hidden">
          <div className="px-5 py-[15px] border-b border-border flex items-center justify-between gap-2.5">
            <span className="font-bold text-[10px] tracking-[.8px] uppercase text-foreground-faint">Trial session</span>
            <span className="font-mono font-semibold text-[10.5px] text-foreground-faint">{sessionMeta}</span>
          </div>

          <div className="p-5 flex flex-col gap-3.5" style={{ minHeight: 340 }}>
            {messages.map((m, i) => (
              <div key={i} className="p-3.5 px-4 animate-[v2In_.28s_ease-out]" style={messageStyle(m)}>
                <div className="font-mono font-bold text-[9.5px] tracking-[.7px] mb-1.5" style={{ color: tagColor(m) }}>
                  {m.tag}
                </div>
                <div className="font-normal text-sm leading-[1.65] whitespace-pre-line" style={{ textWrap: "pretty" as const }}>
                  {m.text}
                </div>
                {m.flag && (
                  <div
                    className="mt-3 px-3.5 py-2.5 rounded-[9px] text-[12.5px] leading-[1.5] font-medium"
                    style={{ background: "rgba(232,163,61,.13)", border: "1px solid rgba(232,163,61,.35)", color: "#7A5010" }}
                  >
                    {m.flag}
                  </div>
                )}
              </div>
            ))}
            {thinking && (
              <div
                className="self-start flex items-center gap-2 px-4 py-3 rounded-[14px_14px_14px_4px]"
                style={{ background: "rgba(255,255,255,.5)", border: "1px solid rgba(255,255,255,.7)" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-dark animate-[v2Dot_1s_ease-in-out_infinite]" />
                <span className="font-medium text-[12.5px] text-foreground-muted">Working through it, step by step...</span>
              </div>
            )}
          </div>

          <div className="mt-auto px-4 pt-3.5 pb-4 border-t border-border">
            <div className="glass-chip rounded-xl overflow-hidden">
              <textarea
                placeholder="Ask it to do something, or paste the thing you want handled..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full min-h-[76px] box-border p-3.5 px-4 bg-transparent border-0 text-foreground text-sm leading-[1.6] resize-y focus:outline-none"
              />
              <div className="flex items-center gap-2.5 px-2.5 py-2.5 border-t border-border flex-wrap">
                <span
                  onClick={() => fileRef.current?.click()}
                  title="Attach files"
                  className="w-[30px] h-[30px] flex-none rounded-lg border border-border-strong flex items-center justify-center font-display text-base text-foreground-muted cursor-pointer"
                >
                  +
                </span>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  onChange={(e) => setFileNames(Array.from(e.target.files || []).map((f) => f.name))}
                  className="hidden"
                />
                <span className="font-medium text-[11px] text-foreground-faint min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
                  {fileNote}
                </span>
                <div
                  onClick={send}
                  className="ml-auto px-5 py-2.5 rounded-[9px] font-semibold text-[13px] cursor-pointer bg-foreground text-background"
                  style={{ boxShadow: "0 3px 10px rgba(28,38,33,.14)" }}
                >
                  {thinking ? "Thinking…" : "Run"}
                </div>
              </div>
            </div>
            <div className="flex gap-[7px] flex-wrap mt-[11px]">
              {SAMPLES.map((label) => (
                <span
                  key={label}
                  onClick={() => setInput(label)}
                  className="glass-chip cursor-pointer px-3 py-[7px] rounded-full font-medium text-[11.5px] text-foreground-muted"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: INSPECTOR (dark) */}
        <div
          className="flex-1 basis-[380px] min-w-[300px] box-border flex flex-col rounded-xl overflow-hidden bg-foreground border border-foreground"
          style={{ boxShadow: "0 14px 40px rgba(28,38,33,.22)" }}
        >
          <div className="px-5 py-[15px] flex items-center gap-2 flex-wrap" style={{ borderBottom: "1px solid rgba(238,241,234,.12)" }}>
            {PANES.map(([id, label]) => (
              <span
                key={id}
                onClick={() => setPane(id as "steps" | "perms" | "score")}
                className="cursor-pointer px-3 py-1.5 rounded-lg font-semibold text-[11.5px]"
                style={{
                  background: pane === id ? "rgba(238,241,234,.16)" : "transparent",
                  color: pane === id ? "#EEF1EA" : "rgba(238,241,234,.5)",
                }}
              >
                {label}
              </span>
            ))}
            <span className="ml-auto font-mono font-semibold text-[10px] tracking-[.6px]" style={{ color: "rgba(238,241,234,.4)" }}>
              LIVE
            </span>
          </div>

          {pane === "steps" && (
            <div className="px-5 py-[18px] flex flex-col gap-[3px]">
              {STEPS.map((s, i) => {
                const open = openStep === i;
                return (
                  <div
                    key={i}
                    onClick={() => setOpenStep(open ? -1 : i)}
                    className="px-3 py-[11px] rounded-[9px] cursor-pointer"
                    style={{
                      background: open ? "rgba(238,241,234,.09)" : "transparent",
                      borderLeft: `2px solid ${TONE_COLORS[s.tone]}`,
                    }}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-semibold text-[10px] flex-none" style={{ color: TONE_COLORS[s.tone] }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="font-medium text-[12.5px] flex-1 min-w-0 text-background">{s.name}</span>
                      <span className="font-mono font-semibold text-[10.5px]" style={{ color: "rgba(238,241,234,.42)" }}>
                        {s.dur}
                      </span>
                    </div>
                    {open && (
                      <div
                        className="mt-2.5 px-3 py-[11px] rounded-[7px] font-mono text-[11.5px] leading-[1.65] whitespace-pre-line"
                        style={{ background: "rgba(238,241,234,.06)", color: "rgba(238,241,234,.72)" }}
                      >
                        {s.detail}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {pane === "perms" && (
            <div className="px-5 py-[18px] flex flex-col gap-2.5">
              <div className="text-[13px] leading-[1.55] mb-1" style={{ color: "rgba(238,241,234,.6)" }}>
                What it asked for while testing. You decide again at install time.
              </div>
              {PERMS.map((p, i) => {
                const mark = p.ok === true ? "✓" : p.ok === false ? "×" : "‖";
                const dotBg = p.ok === true ? "rgba(53,192,176,.2)" : p.ok === false ? "rgba(239,35,60,.2)" : "rgba(232,163,61,.22)";
                const dotColor = p.ok === true ? "#6BD9CB" : p.ok === false ? "#F58593" : "#E8A33D";
                return (
                  <div key={i} className="flex items-center gap-[11px] px-[13px] py-3 rounded-[9px]" style={{ background: "rgba(238,241,234,.06)" }}>
                    <span
                      className="w-5 h-5 flex-none rounded-md flex items-center justify-center font-semibold text-[10px]"
                      style={{ background: dotBg, color: dotColor }}
                    >
                      {mark}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-[12.5px] text-background">{p.name}</div>
                      <div className="font-normal text-[11px]" style={{ color: "rgba(238,241,234,.45)" }}>
                        {p.note}
                      </div>
                    </div>
                    <span className="font-mono font-semibold text-[10px]" style={{ color: dotColor }}>
                      {p.state}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {pane === "score" && (
            <div className="px-5 py-[18px]">
              <div className="flex items-center gap-4 p-4 rounded-xl mb-3.5" style={{ background: "rgba(53,192,176,.14)" }}>
                <div className="font-display font-normal text-[38px] leading-none" style={{ color: "#6BD9CB" }}>
                  92%
                </div>
                <div className="flex-1 min-w-[140px] text-xs leading-[1.5]" style={{ color: "rgba(238,241,234,.7)" }}>
                  It handled 22 of 24 saved examples the way your team would. Both misses were unusual edge cases.
                </div>
              </div>
              <div className="flex flex-col gap-[7px]">
                {CHECKS.map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5 px-3 py-[11px] rounded-[9px]" style={{ background: "rgba(238,241,234,.06)" }}>
                    <span
                      className="w-[18px] h-[18px] flex-none rounded-full flex items-center justify-center font-semibold text-[10px]"
                      style={{ background: c.ok ? "rgba(53,192,176,.2)" : "rgba(232,163,61,.22)", color: c.ok ? "#6BD9CB" : "#E8A33D" }}
                    >
                      {c.ok ? "✓" : "!"}
                    </span>
                    <span className="flex-1 min-w-[120px] font-medium text-xs text-background">{c.name}</span>
                    <span className="font-mono font-semibold text-[11px]" style={{ color: c.ok ? "#6BD9CB" : "#E8A33D" }}>
                      {c.result}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* STICKY VERDICT BAR */}
      <div className="sticky bottom-0 z-30 pt-[18px] pb-[18px] box-border">
        <div className="glass-panel max-w-[1300px] mx-auto flex items-center gap-[18px] flex-wrap justify-between px-[22px] py-[14px] rounded-xl">
          <div className="flex items-center gap-5 flex-wrap">
            {VERDICT_STATS.map((v) => (
              <div key={v.k}>
                <div className="font-bold text-[9.5px] tracking-[.7px] uppercase text-foreground-faint">{v.k}</div>
                <div className="font-semibold text-sm" style={{ color: v.color }}>
                  {v.v}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-normal text-[12.5px] max-w-[230px] text-foreground-muted" style={{ textWrap: "pretty" as const }}>
              Install keeps your sandbox limits: drafts only, human review on.
            </span>
            <div
              onClick={() => setDeclined((d) => !d)}
              className="px-4 py-2.5 rounded-[10px] border font-semibold text-[12.5px] cursor-pointer text-foreground-muted border-border-strong"
            >
              {declined ? "✓ Not for us" : "Not for us"}
            </div>
            <Link
              href="/marketplace"
              className="px-[22px] py-3 rounded-[10px] font-semibold text-[13px] no-underline bg-foreground text-background whitespace-nowrap"
            >
              Install with these limits
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
