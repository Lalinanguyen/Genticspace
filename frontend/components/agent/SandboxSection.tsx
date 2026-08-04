import Link from "next/link";

const COPY = {
  // Track A: an already-live, embeddable HuggingFace Space.
  space: "This agent is open source and already running live. Try it on your own task before deciding to use it.",
  // Track B: a GitHub repo with a genticspace.yaml manifest, cloned and run
  // for real in an isolated Fly Machine on demand (see RunConsole.tsx).
  repo: "This agent's repo is sandbox-ready. Run it for real in an isolated sandbox before deciding to use it.",
};

/**
 * Teaser card on the agent detail page pointing at the full Run console
 * (app/marketplace/[genticspace_id]/try/page.tsx, using RunConsole.tsx) —
 * kept separate rather than duplicating the composer/iframe UI inline here,
 * matching the imported design's own information architecture (Run console
 * is its own page with a "back to agent page" link, not an embedded panel).
 */
export function SandboxSection({ genticspaceId, track }: { genticspaceId: string; track: "space" | "repo" }) {
  return (
    <div className="glass-panel p-[26px] rounded box-border">
      <span className="font-display font-normal text-sm text-foreground block mb-1">Try it in sandbox</span>
      <p className="text-[12.5px] text-foreground-faint mb-4">{COPY[track]}</p>
      <Link
        href={`/marketplace/${genticspaceId}/try`}
        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-[13px] no-underline bg-foreground text-background"
      >
        Open run console →
      </Link>
    </div>
  );
}
