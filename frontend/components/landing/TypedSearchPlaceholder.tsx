"use client";

import { useEffect, useState } from "react";

const SEARCH_PHRASES = [
  "summarize customer emails",
  "triage support tickets",
  "reconcile transactions",
  "screen resumes",
];

type Phase = "type" | "pause" | "delete";

export function TypedSearchPlaceholder() {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("type");

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

  return (
    <span className="flex-1 font-body text-base text-foreground-faint whitespace-nowrap overflow-hidden">
      Try &quot;<span className="text-foreground">{SEARCH_PHRASES[phraseIdx].slice(0, charIdx)}</span>
      <span className="text-foreground font-semibold mx-px" style={{ animation: "cursorBlink 1s steps(1) infinite" }}>
        |
      </span>
      &quot;...
    </span>
  );
}
