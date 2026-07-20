"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getDeploymentGuide, ApiError } from "@/lib/api";

export function DeploymentGuideSection({ tracentId }: { tracentId: string }) {
  const { user, token, loading: authLoading } = useAuth();
  const [instructions, setInstructions] = useState<string | null>(null);
  const [hasReadme, setHasReadme] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The user's AI experience level is an internal signal from their profile,
  // not something they pick per-agent — instructions are always tailored to
  // it automatically, no manual level switcher.
  useEffect(() => {
    if (authLoading || loaded || loading) return;
    const level = user?.experience_level || "Intermediate";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, guarded above
    setLoading(true);
    setError(null);
    getDeploymentGuide(tracentId, level, token ?? undefined)
      .then((guide) => {
        setInstructions(guide.instructions);
        setHasReadme(guide.has_readme);
        setLoaded(true);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Couldn't load deployment instructions.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, tracentId, token]);

  return (
    <div className="p-[26px] rounded bg-surface-2 border border-border box-border">
      <span className="font-display font-bold text-sm text-foreground block mb-4">Deployment guide</span>

      {loading && <p className="text-[13.5px] text-foreground-muted">Generating instructions...</p>}

      {error && <p className="text-[13px] text-error">{error}</p>}

      {loaded && !loading && !error && (
        <>
          {!hasReadme && (
            <p className="text-[12.5px] text-foreground-faint mb-3">
              No source material has been indexed for this agent yet.
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
