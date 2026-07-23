"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { getSandboxGuide, ApiError } from "@/lib/api";
import { agentId } from "@/lib/agent";
import type { Agent } from "@/lib/types";

/**
 * Adapted from the "Run console" design (TryAgent.dc.html, imported via
 * Claude Design): that design is a fully scripted prototype — a fixed set
 * of fictional agents, and "Run" plays back a fake execution trace (spans,
 * model calls, timings) with no real backend involved. We have no
 * execution/tracing backend for arbitrary agents (that's the deferred
 * third-party-execution track, see docs/sandbox-execution-architecture.md),
 * so this keeps the composer/result layout and visual language but drops
 * what would otherwise be fabricated: the "How it worked" trace tab, the
 * "Analytics" batch-run tab, file upload, and per-agent sample prompts (no
 * real curated examples exist). "Run" instead calls the real
 * POST .../sandbox/guide endpoint (Claude-generated, README-grounded task
 * guidance) and the actual live agent is the iframe embed below it, not a
 * simulation.
 */
export function RunConsole({ agent }: { agent: Agent }) {
  const { token } = useAuth();
  const [task, setTask] = useState("");
  const [guidance, setGuidance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const agentName = agent.name || agentId(agent);
  const sandboxUrl = agent.sandbox_url!;

  async function run() {
    const trimmed = task.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getSandboxGuide(agentId(agent), trimmed, token ?? undefined);
      setGuidance(res.guidance);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't get guidance right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-7 items-start flex-wrap">
      {/* Composer */}
      <div className="glass-panel flex-1 basis-[380px] min-w-[300px] max-w-[520px] rounded-xl box-border overflow-hidden">
        <div className="p-[22px] pb-2">
          <div className="font-display font-normal text-xl text-foreground mb-1">
            What should {agentName} handle?
          </div>
          <p className="text-[13px] leading-relaxed text-foreground-muted mb-4">
            Describe the task or paste the content, whatever you&apos;d hand a teammate. We&apos;ll suggest how
            to use it below, then you try it live.
          </p>
          <div className="glass-chip rounded-xl overflow-hidden">
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Describe what you need done, or paste the content to work on..."
              className="w-full min-h-[130px] box-border p-4 bg-transparent border-0 text-foreground text-[14.5px] leading-relaxed resize-y focus:outline-none"
            />
            <div className="flex items-center gap-2.5 px-3 py-2.5 border-t border-border">
              <div
                onClick={loading ? undefined : run}
                className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-[13.5px] cursor-pointer"
                style={{
                  background:
                    task.trim() && !loading ? "linear-gradient(135deg,#072AC8,#2f4fe0)" : "rgba(28,38,33,.08)",
                  color: task.trim() && !loading ? "#fff" : "rgba(28,38,33,.4)",
                }}
              >
                {loading ? "Thinking…" : `Get task guidance`}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Result panel */}
      <div className="glass-panel flex-[1.4] basis-[460px] min-w-[320px] rounded-xl box-border overflow-hidden">
        <div className="border-b border-border px-4 pt-3">
          <span className="inline-block pb-3 font-semibold text-[13px] text-foreground border-b-2 border-cyan">
            Live agent
          </span>
        </div>
        <div className="p-[22px] min-h-[340px] box-border">
          {!guidance && !loading && !error && (
            <div className="flex flex-col items-center justify-center gap-3.5 min-h-[220px] text-center">
              <div className="font-display text-[17px] text-foreground-muted">Nothing yet</div>
              <p className="max-w-[300px] text-[13px] leading-relaxed text-foreground-faint">
                Describe a task on the left and get guidance, or just try the live agent directly below.
              </p>
            </div>
          )}

          {error && <p className="text-[12.5px] text-error mb-3">{error}</p>}

          {guidance && (
            <div className="mb-5">
              <div className="font-semibold text-xs text-foreground-faint mb-1.5">For your task</div>
              <div className="px-4 py-3 rounded bg-[rgba(53,192,176,.08)] border border-[rgba(53,192,176,.25)] text-[13.5px] leading-relaxed whitespace-pre-wrap text-foreground">
                {guidance}
              </div>
            </div>
          )}

          <div className="font-semibold text-xs text-foreground-faint mb-1.5">Try it live</div>
          <div className="rounded-sm overflow-hidden border border-border-strong bg-surface-2" style={{ height: 420 }}>
            <iframe
              src={sandboxUrl}
              title={`${agentName}, live`}
              className="w-full h-full border-0"
              onLoad={() => setIframeLoaded(true)}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 flex-wrap">
            {!iframeLoaded && (
              <p className="text-[11.5px] text-foreground-faint">If the embed doesn&apos;t load, open it directly:</p>
            )}
            <a href={sandboxUrl} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-cyan">
              Open in a new tab ↗
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
