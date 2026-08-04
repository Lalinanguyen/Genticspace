"use client";

import { useRef } from "react";
import type { Agent } from "@/lib/types";
import { CloudBackground } from "@/components/ui/CloudBackground";
import { HeroV3 } from "./HeroV3";
import { FeaturesBento } from "./FeaturesBento";
import { ForDevelopers } from "./ForDevelopers";
import { useTypedPhrase } from "./useTypedPhrase";

const SEARCH_PHRASES = [
  "triage my support inbox",
  "reconcile invoices against our ledger",
  "summarize contracts for risk",
  "screen resumes for the ops role",
];

export function HomeV3({ matches }: { matches: Agent[] }) {
  const typedText = useTypedPhrase(SEARCH_PHRASES);
  const featuresRef = useRef<HTMLDivElement>(null);

  return (
    <div className="relative w-full bg-background box-border overflow-x-clip">
      <CloudBackground bankRef={featuresRef} />
      <HeroV3 typedText={typedText} />
      <div ref={featuresRef}>
        <FeaturesBento typedText={typedText} matches={matches} />
      </div>
      <ForDevelopers />
    </div>
  );
}
