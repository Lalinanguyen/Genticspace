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
import type { SandboxRun, SandboxRunStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 1500;
const TERMINAL_STATUSES: SandboxRunStatus[] = ["succeeded", "failed", "timeout", "canceled"];

const STATUS_LABELS: Record<SandboxRunStatus, string> = {
  queued: "Queued...",
  provisioning: "Starting sandbox...",
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  timeout: "Timed out",
  canceled: "Canceled",
};

export function SandboxSection({ tracentId }: { tracentId: string }) {
  const { user, token, loading: authLoading } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [checked, setChecked] = useState(false);
  const [run, setRun] = useState<SandboxRun | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getSandboxConfig(tracentId)
      .then((config) => setEnabled(config.sandbox_enabled))
      .catch(() => setEnabled(false))
      .finally(() => setChecked(true));
  }, [tracentId]);

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
    try {
      const { run_id } = await startSandboxRun(tracentId, token);
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

  // Loading is a brief transient, not a state worth showing UI for -- but
  // once we know the answer, the card always renders regardless of
  // sandbox_enabled, so the feature is discoverable even for agents that
  // aren't sandbox-ready yet (rather than disappearing entirely).
  if (!checked || authLoading) return null;

  const isActive = run ? !TERMINAL_STATUSES.includes(run.status) : false;
  const canRun = enabled && !!user && !isActive && !starting;

  return (
    <div className="p-[26px] rounded bg-surface-2 border border-border box-border">
      <div className="flex items-center justify-between mb-4">
        <span className="font-display font-bold text-sm text-foreground">Sandbox mode</span>
        {run && (
          <span className="text-[12px] font-semibold text-foreground-faint">{STATUS_LABELS[run.status]}</span>
        )}
      </div>

      {!enabled && (
        <p className="text-[13px] text-foreground-muted mb-3">
          This agent isn&apos;t sandbox-ready yet. Its repo needs a <code>tracent.yaml</code> manifest declaring
          build/run commands.
        </p>
      )}

      {enabled && !user && (
        <p className="text-[13px] text-foreground-muted mb-3">Log in to run this agent in a live sandbox.</p>
      )}

      <div className="flex items-center gap-2.5 mb-3">
        <div
          onClick={canRun ? handleRun : undefined}
          className="px-3.5 py-2 rounded-sm font-semibold text-[12.5px] text-white"
          style={{
            background: canRun ? "linear-gradient(135deg,#072AC8,#2f4fe0)" : "rgba(244,247,243,.08)",
            color: canRun ? "#fff" : "rgba(244,247,243,.4)",
            cursor: canRun ? "pointer" : "not-allowed",
          }}
        >
          {starting ? "Starting..." : "Run"}
        </div>
        {isActive && (
          <div
            onClick={handleStop}
            className="px-3.5 py-2 rounded-sm font-semibold text-[12.5px] cursor-pointer border border-border text-foreground-muted"
          >
            Stop
          </div>
        )}
      </div>

      {error && <p className="text-[13px] text-error mb-2">{error}</p>}

      {run && (
        <pre
          ref={logRef}
          className="mt-2 p-3 rounded bg-[rgba(0,0,0,.35)] border border-border text-[12px] leading-relaxed text-foreground-muted whitespace-pre-wrap max-h-[360px] overflow-y-auto"
        >
          {run.logs || "Waiting for output..."}
        </pre>
      )}
    </div>
  );
}
