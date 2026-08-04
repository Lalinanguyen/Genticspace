"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  ApiError,
  getSandboxConfig,
  getSandboxGuide,
  getSandboxRun,
  startSandboxRun,
  stopSandboxRun,
} from "@/lib/api";
import { agentId } from "@/lib/agent";
import type { Agent, SandboxRun, SandboxRunStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 1500;
const TERMINAL_STATUSES: SandboxRunStatus[] = ["succeeded", "failed", "timeout", "canceled"];

const STATUS_BADGE: Record<SandboxRunStatus, { label: string; color: string; bg: string; border: string }> = {
  queued: { label: "QUEUED", color: "#1C2621", bg: "rgba(28,38,33,.06)", border: "rgba(28,38,33,.16)" },
  provisioning: { label: "STARTING", color: "#E8A33D", bg: "rgba(232,163,61,.12)", border: "rgba(232,163,61,.35)" },
  running: { label: "RUNNING", color: "#E8A33D", bg: "rgba(232,163,61,.12)", border: "rgba(232,163,61,.35)" },
  succeeded: { label: "✓ SUCCESS", color: "#178C7E", bg: "rgba(53,192,176,.12)", border: "rgba(53,192,176,.35)" },
  failed: { label: "✕ FAILED", color: "#EF233C", bg: "rgba(239,35,60,.1)", border: "rgba(239,35,60,.35)" },
  timeout: { label: "⏱ TIMED OUT", color: "#EF233C", bg: "rgba(239,35,60,.1)", border: "rgba(239,35,60,.35)" },
  canceled: { label: "CANCELED", color: "rgba(28,38,33,.55)", bg: "rgba(28,38,33,.06)", border: "rgba(28,38,33,.16)" },
};

type ViewTab = "result" | "trace" | "analytics";

function glassPanel(extra = "") {
  return `glass-panel rounded box-border ${extra}`;
}

/**
 * Two independent, real execution tracks, mutually exclusive per agent:
 *
 * - Track A (HF Spaces, agent.sandboxable/sandbox_url -- see
 *   app/services/agent_queries.py::compute_sandbox_fields): the agent is
 *   already a live, embeddable web app. TaskGuidancePanel gets real
 *   AI-generated task guidance (POST .../sandbox/guide) alongside a direct
 *   iframe embed of the actual agent -- no execution backend needed since
 *   nothing needs to be run, it's already running.
 * - Track B (GitHub repos with a genticspace.yaml manifest,
 *   agent_sandbox_config.sandbox_enabled): FlyRunConsolePanel clones and
 *   actually runs the agent's real repo in an isolated Fly Machine, polling
 *   for live status/logs -- see docs/sandbox-hardening-plan.md.
 *
 * A given agent qualifies for at most one track today (Spaces don't have a
 * GitHub manifest; GitHub repos aren't HF Spaces), so this is a branch, not
 * a combined UI.
 */
export function RunConsole({ agent }: { agent: Agent }) {
  if (agent.sandboxable && agent.sandbox_url) {
    return <TaskGuidancePanel agent={agent} sandboxUrl={agent.sandbox_url} />;
  }
  return <FlyRunConsolePanel agent={agent} />;
}

function TaskGuidancePanel({ agent, sandboxUrl }: { agent: Agent; sandboxUrl: string }) {
  const { token } = useAuth();
  const [task, setTask] = useState("");
  const [guidance, setGuidance] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  const agentName = agent.name || agentId(agent);

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

function FlyRunConsolePanel({ agent }: { agent: Agent }) {
  const { user, token } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [run, setRun] = useState<SandboxRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewTab>("result");
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getSandboxConfig(agent.tracent_id)
      .then((c) => setEnabled(c.sandbox_enabled))
      .catch(() => setEnabled(false))
      .finally(() => setChecked(true));
  }, [agent.tracent_id]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [run?.logs]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }
  useEffect(() => stopPolling, []);

  function pollRun(runId: number, activeToken: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const latest = await getSandboxRun(runId, activeToken);
        setRun(latest);
        if (TERMINAL_STATUSES.includes(latest.status)) stopPolling();
      } catch {
        stopPolling();
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleRun() {
    if (!token || starting) return;
    setStarting(true);
    setError(null);
    setView("trace");
    try {
      const { run_id } = await startSandboxRun(agent.tracent_id, token);
      const initial = await getSandboxRun(run_id, token);
      setRun(initial);
      if (!TERMINAL_STATUSES.includes(initial.status)) pollRun(run_id, token);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the sandbox run.");
    } finally {
      setStarting(false);
    }
  }

  async function handleStop() {
    if (!token || !run) return;
    try {
      await stopSandboxRun(run.run_id, token);
      stopPolling();
      setRun({ ...run, status: "canceled" });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't stop the run.");
    }
  }

  const isActive = run ? !TERMINAL_STATUSES.includes(run.status) : false;
  const isDone = run ? TERMINAL_STATUSES.includes(run.status) : false;
  const canRun = enabled && !!user && !isActive && !starting;

  const durationSeconds =
    run?.finished_at && run?.created_at
      ? Math.max(0, Math.round((new Date(run.finished_at).getTime() - new Date(run.created_at).getTime()) / 1000))
      : null;

  const resultSummary = !run
    ? null
    : run.status === "succeeded"
      ? "Finished successfully."
      : run.status === "failed"
        ? `Exited with a non-zero status${run.exit_code != null ? ` (code ${run.exit_code})` : ""}.`
        : run.status === "timeout"
          ? "Timed out before finishing."
          : run.status === "canceled"
            ? "Stopped."
            : "In progress...";

  return (
    <>
      {run && (
        <div className="flex justify-end pb-4">
          <span
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded font-mono font-semibold text-xs"
            style={{ background: STATUS_BADGE[run.status].bg, border: `1px solid ${STATUS_BADGE[run.status].border}`, color: STATUS_BADGE[run.status].color }}
          >
            {isActive && (
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: STATUS_BADGE[run.status].color, animation: "glow-pulse 1s ease-in-out infinite" }}
              />
            )}
            {STATUS_BADGE[run.status].label}
            {durationSeconds != null && ` · ${durationSeconds}s`}
          </span>
        </div>
      )}

      {!checked ? null : !enabled ? (
        <div className={glassPanel("p-8 text-center")}>
          <p className="m-0 text-[14px] text-foreground-muted">
            This agent isn&apos;t sandbox-ready yet. It needs either a <code>genticspace.yaml</code> manifest
            declaring build/run commands, or a real README the sandbox agent can read to figure out installation
            itself.
          </p>
        </div>
      ) : (
        <div className="flex gap-7 items-start flex-wrap">
          <div className={glassPanel("flex-1 min-w-[300px] max-w-[420px] p-6 flex flex-col gap-4")}>
            <div>
              <div className="font-display font-normal text-[19px] text-foreground mb-1">
                Run {agent.name || agent.tracent_id}
              </div>
              <p className="m-0 text-[13px] leading-relaxed text-foreground-muted">
                This clones the repository at its declared ref, runs its build command if it has one, then runs it
                for real. Output streams back live below.
              </p>
            </div>

            {agent.github_url && (
              <div className="glass-chip rounded px-3 py-2.5 font-mono text-[12px] text-foreground-muted break-all">
                {agent.github_url}
              </div>
            )}

            {!user ? (
              <p className="text-[13px] text-foreground-muted">Log in to run this agent.</p>
            ) : (
              <div className="flex items-center gap-2.5">
                <div
                  onClick={canRun ? handleRun : undefined}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded font-semibold text-[13.5px]"
                  style={{
                    background: canRun ? "#1C2621" : "rgba(28,38,33,.08)",
                    color: canRun ? "#EEF1EA" : "rgba(28,38,33,.4)",
                    cursor: canRun ? "pointer" : "default",
                  }}
                >
                  {starting ? "Starting..." : isDone ? "▶ Run again" : "▶ Run " + (agent.name || "agent")}
                </div>
                {isActive && (
                  <div
                    onClick={handleStop}
                    className="px-4 py-3 rounded border border-border font-semibold text-[13px] text-foreground-muted cursor-pointer"
                  >
                    Stop
                  </div>
                )}
              </div>
            )}

            {error && <p className="text-[12.5px] text-error m-0">{error}</p>}
          </div>

          <div className={glassPanel("flex-[1.4] min-w-[320px] overflow-hidden")}>
            <div className="flex items-center gap-1 px-4 pt-3 border-b border-border">
              {(["result", "trace", "analytics"] as ViewTab[]).map((v) => (
                <div
                  key={v}
                  onClick={() => setView(v)}
                  className="px-4 pb-3 font-semibold text-[13px] cursor-pointer select-none"
                  style={{
                    color: view === v ? "var(--color-foreground)" : "var(--color-foreground-muted)",
                    borderBottom: view === v ? "2px solid var(--color-cyan)" : "2px solid transparent",
                  }}
                >
                  {v === "result" ? "Result" : v === "trace" ? "How it worked" : "Analytics"}
                </div>
              ))}
            </div>

            <div className="p-5 min-h-[320px] box-border">
              {!run && (
                <div className="flex flex-col items-center justify-center gap-3.5 min-h-[280px] text-center">
                  <span className="text-3xl text-foreground-faint">▷</span>
                  <div className="font-display font-normal text-[17px] text-foreground-muted">
                    Nothing has run yet
                  </div>
                  <p className="m-0 max-w-[280px] text-[13px] leading-relaxed text-foreground-faint">
                    Hit Run on the left. The real clone/build/run output shows up here.
                  </p>
                </div>
              )}

              {run && view === "result" && (
                <div className="flex flex-col gap-4">
                  <p className="m-0 text-[14px] text-foreground">{resultSummary}</p>
                  {isDone && (
                    <pre className="m-0 p-3.5 rounded bg-[rgba(0,0,0,.06)] border border-border text-[12px] leading-relaxed text-foreground-muted whitespace-pre-wrap max-h-[280px] overflow-y-auto">
                      {run.logs.trim().split("\n").slice(-15).join("\n") || "(no output)"}
                    </pre>
                  )}
                </div>
              )}

              {run && view === "trace" && (
                <pre
                  ref={logRef}
                  className="m-0 p-3.5 rounded bg-[rgba(0,0,0,.06)] border border-border text-[12px] leading-relaxed text-foreground-muted whitespace-pre-wrap max-h-[420px] overflow-y-auto"
                >
                  {run.logs || "Waiting for output..."}
                </pre>
              )}

              {run && view === "analytics" && (
                <div className="flex flex-col gap-3 text-[13px]">
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-foreground-muted">Status</span>
                    <span className="font-semibold text-foreground">{run.status}</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-foreground-muted">Duration</span>
                    <span className="font-semibold text-foreground">
                      {durationSeconds != null ? `${durationSeconds}s` : "-"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-border">
                    <span className="text-foreground-muted">Exit code</span>
                    <span className="font-semibold text-foreground">{run.exit_code ?? "-"}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-foreground-muted">Log size</span>
                    <span className="font-semibold text-foreground">{run.logs.length.toLocaleString()} chars</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
