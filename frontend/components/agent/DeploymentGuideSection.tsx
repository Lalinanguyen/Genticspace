"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { getDeploymentGuide, ApiError } from "@/lib/api";

const LEVELS = ["Beginner", "Intermediate", "Advanced"] as const;

export function DeploymentGuideSection({ tracentId }: { tracentId: string }) {
  const { user, token } = useAuth();
  const [level, setLevel] = useState<string>(user?.experience_level || "Intermediate");
  const [instructions, setInstructions] = useState<string | null>(null);
  const [hasReadme, setHasReadme] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function fetchGuide(lvl: string) {
    setLoading(true);
    setError(null);
    try {
      const guide = await getDeploymentGuide(tracentId, lvl, token ?? undefined);
      setInstructions(guide.instructions);
      setHasReadme(guide.has_readme);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load deployment instructions.");
    } finally {
      setLoading(false);
    }
  }

  function selectLevel(lvl: string) {
    setLevel(lvl);
    fetchGuide(lvl);
  }

  return (
    <div className="p-[26px] rounded bg-surface-2 border border-border box-border">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <span className="font-display font-bold text-sm text-foreground">Deployment guide</span>
        <div className="flex gap-2">
          {LEVELS.map((lvl) => (
            <button
              key={lvl}
              onClick={() => selectLevel(lvl)}
              className="px-3 py-1.5 rounded-sm font-semibold text-[12px] border"
              style={{
                background: level === lvl ? "rgba(53,192,176,.14)" : "rgba(244,247,243,.05)",
                borderColor: level === lvl ? "rgba(53,192,176,.4)" : "rgba(244,247,243,.14)",
                color: level === lvl ? "#35C0B0" : "rgba(244,247,243,.7)",
              }}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {!loaded && !loading && (
        <button
          onClick={() => fetchGuide(level)}
          className="px-5 py-2.5 rounded font-semibold text-[13.5px] text-white"
          style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)" }}
        >
          Generate instructions
        </button>
      )}

      {loading && <p className="text-[13.5px] text-foreground-muted">Generating instructions...</p>}

      {error && <p className="text-[13px] text-error">{error}</p>}

      {loaded && !loading && !error && (
        <>
          {!hasReadme && (
            <p className="text-[12.5px] text-foreground-faint mb-3">
              No README has been indexed for this agent yet.
            </p>
          )}
          <div className="text-[13.5px] leading-relaxed text-foreground-muted whitespace-pre-wrap">
            {instructions}
          </div>
        </>
      )}
    </div>
  );
}
