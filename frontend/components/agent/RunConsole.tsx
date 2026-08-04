"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  ApiError,
  getSandboxConfig,
  getSandboxRun,
  startSandboxRun,
  stopSandboxRun,
} from "@/lib/api";
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

export function RunConsole({ agent }: { agent: Agent }) {
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
    <div className="w-full max-w-[1440px] mx-auto px-[5%] pb-24 box-border">
      <div className="flex items-end justify-between gap-4 flex-wrap pt-9 pb-6">
        <div>
          <a
            href={`/marketplace/${agent.tracent_id}`}
            className="font-semibold text-[12.5px] text-foreground-faint no-underline hover:text-foreground"
          >
            ← Back to agent page
          </a>
          <h1 className="font-display font-normal text-[34px] leading-tight text-foreground tracking-tight mt-3 mb-1.5 flex items-center gap-3">
            Run console
            <span className="px-2 py-0.5 rounded-sm font-bold text-[11px] tracking-[1px] text-white align-middle" style={{ background: "#178C7E" }}>
              BETA
            </span>
          </h1>
          <p className="m-0 text-sm text-foreground-muted">
            Clones and runs {agent.name || agent.tracent_id}&apos;s real repository in an isolated sandbox, off
            production&apos;s network.
          </p>
        </div>
        {run && (
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
        )}
      </div>

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
    </div>
  );
}
