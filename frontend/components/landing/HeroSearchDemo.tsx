"use client";

import { useEffect, useState } from "react";

interface DemoResult {
  initials: string;
  name: string;
  desc: string;
  longDesc?: string;
  gradient: string;
  logo?: string;
  logoScale?: number;
}

interface SearchExample {
  phrase: string;
  tag: string;
  results: DemoResult[];
}

const SEARCH_EXAMPLES: SearchExample[] = [
  {
    phrase: 'find an AI meeting notetaker',
    tag: "Productivity",
    results: [
      {
        initials: "GR",
        name: "Granola",
        desc: "Meeting notes, automatically organized",
        longDesc:
          "Joins your calls, takes structured notes, and turns them into shareable summaries, no bot avatar required.",
        gradient: "from-cyan to-cyan-dark",
        logo: "/assets/granola-icon.png",
      },
      {
        initials: "UM",
        name: "Usemotion",
        desc: "Calendar & task automation",
        gradient: "from-blue to-blue-to",
        logo: "/assets/usemotion-icon.png",
      },
    ],
  },
  {
    phrase: "help me build UI design",
    tag: "Design",
    results: [
      {
        initials: "FM",
        name: "Figma Make",
        desc: "Prompt-to-UI design generation",
        longDesc:
          "Describe a screen in plain language and get an editable, on-brand UI design back in Figma.",
        gradient: "from-blue to-blue-to",
        logo: "/assets/figma-icon.png",
        logoScale: 2.2,
      },
      {
        initials: "UX",
        name: "UX Pilot",
        desc: "AI-assisted UX design flows",
        gradient: "from-cyan to-cyan-dark",
        logo: "/assets/uxpilot-icon.png",
      },
    ],
  },
  {
    phrase: "automate sales calls",
    tag: "Sales",
    results: [
      {
        initials: "SC",
        name: "SalesCloser AI",
        desc: "Runs and closes sales calls",
        longDesc:
          "Handles live sales conversations end-to-end, from discovery questions to closing the deal.",
        gradient: "from-cyan to-cyan-dark",
        logo: "/assets/salescloser-icon.png",
      },
      {
        initials: "LI",
        name: "Lindy.ai",
        desc: "Builds custom sales agents",
        gradient: "from-blue to-blue-to",
        logo: "/assets/lindy-icon.png",
      },
    ],
  },
];

type Phase = "click" | "type" | "clickResult" | "profile";

function ResultTile({ result, size }: { result: DemoResult; size: number }) {
  if (result.logo) {
    return (
      <div
        className="rounded flex-none flex items-center justify-center bg-foreground overflow-hidden"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={result.logo}
          alt=""
          className="w-full h-full object-cover"
          style={result.logoScale ? { transform: `scale(${result.logoScale})` } : undefined}
        />
      </div>
    );
  }
  return (
    <div
      className={`rounded flex-none flex items-center justify-center font-display font-bold text-background bg-gradient-to-br ${result.gradient}`}
      style={{ width: size, height: size, fontSize: size * 0.28 }}
    >
      {result.initials}
    </div>
  );
}

export function HeroSearchDemo() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("click");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const example = SEARCH_EXAMPLES[phraseIdx];

    if (phase === "click") {
      timer = setTimeout(() => setPhase("type"), 850);
    } else if (phase === "type") {
      if (charIdx < example.phrase.length) {
        timer = setTimeout(() => setCharIdx((c) => c + 1), 55);
      } else {
        timer = setTimeout(() => setPhase("clickResult"), 1200);
      }
    } else if (phase === "clickResult") {
      timer = setTimeout(() => setPhase("profile"), 700);
    } else if (phase === "profile") {
      timer = setTimeout(() => {
        setPhraseIdx((i) => (i + 1) % SEARCH_EXAMPLES.length);
        setCharIdx(0);
        setPhase("click");
      }, 2400);
    }
    return () => clearTimeout(timer);
  }, [phase, charIdx, phraseIdx]);

  const example = SEARCH_EXAMPLES[phraseIdx];
  const resultsVisible = phase === "clickResult" || (phase === "type" && charIdx === example.phrase.length);
  const showProfile = phase === "profile";
  const primary = example.results[0];
  const secondary = example.results[1];

  return (
    <div className="relative flex-1 min-w-[280px] max-w-[560px] min-h-[326px] p-[26px] rounded bg-surface-2 border border-border-strong glass-card box-border">
      {/* SEARCH VIEW */}
      <div
        className="transition-opacity duration-400"
        style={{ opacity: showProfile ? 0 : 1 }}
      >
        <div className="relative flex items-center gap-3 px-5 py-[18px] rounded-md bg-[rgba(244,247,243,.06)] border border-border mb-5">
          <div className="w-5 h-5 border-[2.5px] border-[rgba(244,247,243,.5)] rounded-full relative flex-none" />
          <span className="text-base text-[rgba(244,247,243,.45)] whitespace-nowrap flex items-center gap-px">
            Try &quot;<span className="text-foreground">{example.phrase.slice(0, charIdx)}</span>
            <span className="text-foreground font-semibold animate-pulse ml-px">|</span>&quot;...
          </span>
        </div>
        <div className="flex gap-2 flex-wrap mb-5">
          <span className="px-3 py-1.5 rounded-sm bg-[rgba(255,255,255,.14)] border border-[#FFFFFF59] font-semibold text-[11.5px] text-white">
            {example.tag}
          </span>
        </div>
        <div className="relative flex flex-col gap-2.5">
          {[primary, secondary].map((result, i) => (
            <div
              key={result.name}
              className="flex items-center gap-3 p-3 rounded bg-[rgba(244,247,243,.04)] shadow-[0_10px_24px_rgba(0,0,0,.35)] transition-all duration-400"
              style={{
                opacity: resultsVisible ? 1 : 0,
                transform: resultsVisible ? "translateY(0)" : "translateY(8px)",
                transitionDelay: `${i * 90}ms`,
              }}
            >
              <ResultTile result={result} size={34} />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-[13.5px] text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                  {result.name}
                </div>
                <div className="text-[11.5px] text-foreground-faint">{result.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* PROFILE VIEW */}
      <div
        className="absolute inset-0 p-[26px] box-border rounded bg-surface-2 border border-border-strong glass-card transition-opacity duration-400"
        style={{ opacity: showProfile ? 1 : 0, pointerEvents: showProfile ? "auto" : "none" }}
      >
        <div className="flex items-center gap-3.5 mb-[18px]">
          <ResultTile result={primary} size={52} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="font-display font-bold text-[17px] text-foreground">{primary.name}</span>
              <span className="inline-flex items-center gap-1 font-bold text-[10px] text-cyan">
                <svg width="13" height="13" viewBox="0 0 16 16" className="flex-none">
                  <path
                    d="M8 0l1.6 1.24 2.02-.28.62 1.94 1.94.62-.28 2.02L15 7.14l-1.24 1.6.28 2.02-1.94.62-.62 1.94-2.02-.28L8 14.29l-1.6-1.24-2.02.28-.62-1.94-1.94-.62.28-2.02L1 7.14l1.24-1.6-.28-2.02 1.94-.62.62-1.94 2.02.28L8 0z"
                    fill="#3897F0"
                  />
                  <path
                    d="M5.3 8.1l1.7 1.7 3.5-4"
                    fill="none"
                    stroke="#fff"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Verified
              </span>
            </div>
            <div className="text-xs text-foreground-faint">{primary.desc}</div>
          </div>
        </div>
        <div className="flex items-center gap-3.5 p-4 rounded bg-[rgba(244,247,243,.05)] border border-border shadow-[0_12px_30px_rgba(0,0,0,.4)] mb-3">
          <svg width="46" height="46" viewBox="0 0 46 46" className="flex-none -rotate-90">
            <circle cx="23" cy="23" r="18" fill="none" stroke="rgba(244,247,243,.12)" strokeWidth="4" />
            <circle
              cx="23"
              cy="23"
              r="18"
              fill="none"
              stroke="#35C0B0"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="113"
              strokeDashoffset="3.4"
            />
          </svg>
          <div>
            <div className="font-display font-bold text-base text-foreground">97%</div>
            <div className="font-medium text-[11.5px] text-foreground-faint">Satisfaction rate</div>
          </div>
        </div>
        <div className="px-3.5 py-3 rounded bg-[rgba(53,192,176,.08)] border border-[rgba(53,192,176,.25)] shadow-[0_12px_30px_rgba(0,0,0,.35)] text-xs leading-relaxed text-foreground-muted">
          {primary.longDesc}
        </div>
      </div>
    </div>
  );
}
