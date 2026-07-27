"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const SEARCH_PHRASES = [
  "summarize customer emails",
  "triage support tickets",
  "reconcile transactions",
  "screen resumes",
];

const EXAMPLE_TASKS = ["Triage support tickets", "Summarize contracts", "Reconcile transactions", "Screen resumes"];

function useTypedPhrase() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [phase, setPhase] = useState<"type" | "pause" | "delete">("type");

  useEffect(() => {
    const phrase = SEARCH_PHRASES[phraseIdx];
    let timer: ReturnType<typeof setTimeout>;
    if (phase === "type") {
      if (charIdx < phrase.length) {
        timer = setTimeout(() => setCharIdx((c) => c + 1), 55);
      } else {
        timer = setTimeout(() => setPhase("pause"), 1400);
      }
    } else if (phase === "pause") {
      timer = setTimeout(() => setPhase("delete"), 30);
    } else {
      if (charIdx > 0) {
        timer = setTimeout(() => setCharIdx((c) => c - 1), 25);
      } else {
        timer = setTimeout(() => {
          setPhraseIdx((i) => (i + 1) % SEARCH_PHRASES.length);
          setPhase("type");
        }, 300);
      }
    }
    return () => clearTimeout(timer);
  }, [phase, charIdx, phraseIdx]);

  return SEARCH_PHRASES[phraseIdx].slice(0, charIdx);
}

export function Hero() {
  const router = useRouter();
  const typed = useTypedPhrase();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submitSearch(q: string) {
    const query = q.trim() || typed;
    router.push(`/marketplace${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  return (
    <div className="relative w-full overflow-hidden box-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/hero-bg.svg"
        alt=""
        aria-hidden="true"
        className="absolute top-[-60px] left-0 w-full h-[420px] object-cover object-top opacity-40 pointer-events-none z-0"
      />
      <svg
        viewBox="0 0 24 40"
        aria-hidden="true"
        className="absolute top-[322px] right-[2.5%] w-[23px] h-[38px] opacity-55 pointer-events-none z-0"
        fill="none"
        stroke="#1C2621"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="7" r="5" />
        <path d="M12 12v14M12 17l-7 4M12 17l7 3M12 26l-5 11M12 26l6 10" />
      </svg>

      <div className="relative z-[1] px-[5%] pt-20 pb-14 box-border max-w-[900px]">
        <h1 className="m-0 mb-[22px] font-display font-normal text-[60px] leading-[1.05] text-foreground tracking-[-1.2px]" style={{ textWrap: "balance" }}>
          Find an AI agent for the job. In plain English.
        </h1>
        <p className="mt-8 mb-[34px] font-body text-lg leading-[1.6] text-foreground max-w-[560px]">
          Stop wasting your time hiring engineers. Search, learn and deploy for your specific workflow today.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(value);
          }}
          className="glass-panel-lg flex items-center gap-3 max-w-[600px] px-[22px] py-4 rounded-[14px] box-border"
        >
          <div className="w-[19px] h-[19px] border-2 border-[rgba(28,38,33,.4)] rounded-full relative flex-none">
            <div
              className="absolute -bottom-[7px] -right-[7px] w-2 h-0.5 bg-[rgba(28,38,33,.4)]"
              style={{ transform: "rotate(45deg)" }}
            />
          </div>
          <div className="flex-1 relative min-w-0">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full bg-transparent border-none outline-none font-body text-base text-foreground relative z-[1]"
              style={{ opacity: value ? 1 : 0 }}
              aria-label="Search the marketplace"
            />
            {!value && (
              <span
                className="absolute inset-0 flex items-center font-body text-base text-[rgba(28,38,33,.45)] whitespace-nowrap overflow-hidden pointer-events-none"
                onClick={() => inputRef.current?.focus()}
              >
                Try &quot;<span className="text-foreground">{typed}</span>
                <span className="text-foreground font-semibold ml-px" style={{ animation: "cursorBlink 1s steps(1) infinite" }}>
                  |
                </span>
                &quot;...
              </span>
            )}
          </div>
          <button
            type="submit"
            className="font-bold text-[13.5px] text-[#08302B] bg-cyan px-[18px] py-[9px] rounded whitespace-nowrap flex-none cursor-pointer"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mt-4">
          {EXAMPLE_TASKS.map((task) => (
            <button
              key={task}
              type="button"
              onClick={() => submitSearch(task)}
              className="glass-panel px-3.5 py-2 rounded font-semibold text-[12.5px] text-[rgba(28,38,33,.82)] cursor-pointer"
            >
              {task}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
