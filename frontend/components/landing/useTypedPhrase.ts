"use client";

import { useEffect, useState } from "react";

type Phase = "type" | "pause" | "delete";

/** Cycles through phrases with a type/pause/delete rhythm, shared by the hero
 * assist bar and the "Search in plain English" feature card so both stay in
 * sync on the same phrase instead of drifting independently. */
export function useTypedPhrase(phrases: string[]): string {
  const [phraseIdx, setPhraseIdx] = useState(0);
  const [charIdx, setCharIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("type");

  useEffect(() => {
    const phrase = phrases[phraseIdx];
    let timer: ReturnType<typeof setTimeout>;

    if (phase === "type") {
      if (charIdx < phrase.length) {
        timer = setTimeout(() => setCharIdx((c) => c + 1), 55);
      } else {
        timer = setTimeout(() => setPhase("pause"), 1600);
      }
    } else if (phase === "pause") {
      timer = setTimeout(() => setPhase("delete"), 30);
    } else {
      if (charIdx > 0) {
        timer = setTimeout(() => setCharIdx((c) => c - 1), 22);
      } else {
        timer = setTimeout(() => {
          setPhraseIdx((i) => (i + 1) % phrases.length);
          setPhase("type");
        }, 350);
      }
    }
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, charIdx, phraseIdx]);

  return phrases[phraseIdx].slice(0, charIdx);
}
