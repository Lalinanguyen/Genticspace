"use client";

import Link from "next/link";
import type { SandboxTrial } from "@/lib/api";

// Real statuses from agent_sandbox_runs (see app/services/sandbox_runner.py),
// not the mock's fictional Running/Idle/Paused set -- mapped to the closest
// visual tone.
const STATUS_TONE: Record<string, { bg: string; color: string; label: string; pulse: boolean }> = {
  queued: { bg: "rgba(232,163,61,.16)", color: "#8A5B10", label: "Queued", pulse: false },
  provisioning: { bg: "rgba(53,192,176,.14)", color: "#178C7E", label: "Starting", pulse: true },
  running: { bg: "rgba(53,192,176,.14)", color: "#178C7E", label: "Running", pulse: true },
  succeeded: { bg: "rgba(53,192,176,.14)", color: "#178C7E", label: "Succeeded", pulse: false },
  failed: { bg: "rgba(239,35,60,.12)", color: "#EF233C", label: "Failed", pulse: false },
  timeout: { bg: "rgba(232,163,61,.16)", color: "#8A5B10", label: "Timed out", pulse: false },
  canceled: { bg: "rgba(28,38,33,.06)", color: "rgba(28,38,33,.55)", label: "Canceled", pulse: false },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? (parts[0][0] + parts[1][0]).toUpperCase() : name.slice(0, 2).toUpperCase();
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr${hr === 1 ? "" : "s"} ago`;
  const days = Math.floor(hr / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export function YourSandboxTrials({ trials }: { trials: SandboxTrial[] }) {
  const runningCount = trials.filter((t) => ["queued", "provisioning", "running"].includes(t.latest_status)).length;

  return (
    <div className="rounded-xl overflow-hidden bg-[rgba(255,255,255,.72)] backdrop-blur-[14px] border border-white/80 shadow-[0_10px_34px_rgba(28,38,33,.09)]">
      {/* Breadcrumb bar */}
      <div className="flex items-center gap-1.5 px-5 py-2.5 border-b border-[rgba(28,38,33,.07)] flex-wrap">
        <span className="px-1.5 py-0.5 rounded-sm text-[12.5px] font-medium text-[rgba(28,38,33,.55)]">Sandbox</span>
        <span className="text-[12px] text-[rgba(28,38,33,.3)]">/</span>
        <span className="px-1.5 py-0.5 rounded-sm text-[12.5px] font-medium text-foreground">Your agents</span>
        <div className="ml-auto">
          <Link
            href="/sandbox?browse=1"
            className="px-3 py-1.5 rounded-sm font-semibold text-xs text-background no-underline"
            style={{ background: "#1C2621" }}
          >
            + New trial
          </Link>
        </div>
      </div>

      <div className="p-[34px] pt-[30px] box-border">
        <h1 className="m-0 font-display font-normal text-[34px] tracking-[-.3px] text-foreground">Your agents</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-foreground-muted max-w-[560px]">
          Every agent you&apos;ve tried in the sandbox. Trials can read, plan and draft, but nothing leaves until you
          deploy it yourself.
        </p>

        {trials.length > 0 && (
          <div className="flex gap-2 flex-wrap mt-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono font-semibold text-[11px]" style={{ background: "rgba(53,192,176,.14)", color: "#178C7E" }}>
              <span className="w-[5px] h-[5px] rounded-full flex-none" style={{ background: "#178C7E" }} />
              {runningCount} running now
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-mono font-semibold text-[11px] bg-[rgba(28,38,33,.06)] text-[rgba(28,38,33,.6)]">
              {trials.length} agent{trials.length === 1 ? "" : "s"} tried
            </span>
          </div>
        )}

        <div className="mt-6 flex items-center gap-1.5">
          <span className="font-bold text-[13px] text-foreground">Sandbox trials</span>
          <span className="px-2 py-0.5 rounded-full font-mono font-semibold text-[10.5px] bg-[rgba(28,38,33,.06)] text-[rgba(28,38,33,.55)]">
            {trials.length}
          </span>
        </div>

        {trials.length === 0 ? (
          <div className="mt-3 py-14 px-5 text-center rounded-md border border-[rgba(28,38,33,.08)] bg-white/60">
            <p className="text-[13.5px] text-foreground-muted mb-3">
              You haven&apos;t tried an agent in the sandbox yet.
            </p>
            <Link href="/sandbox?browse=1" className="font-semibold text-[13px] text-cyan-dark">
              Browse sandbox-ready agents →
            </Link>
          </div>
        ) : (
          <div className="mt-2 rounded-md border border-[rgba(28,38,33,.08)] overflow-hidden bg-white/60">
            <div className="hidden sm:grid grid-cols-[1.7fr_.8fr_.6fr_.8fr_.5fr] gap-2.5 items-center px-3.5 py-2 border-b border-[rgba(28,38,33,.07)]">
              <span className="font-semibold text-[10.5px] tracking-[.4px] text-[rgba(28,38,33,.4)]">Agent</span>
              <span className="font-semibold text-[10.5px] tracking-[.4px] text-[rgba(28,38,33,.4)]">Status</span>
              <span className="font-semibold text-[10.5px] tracking-[.4px] text-[rgba(28,38,33,.4)]">Runs</span>
              <span className="font-semibold text-[10.5px] tracking-[.4px] text-[rgba(28,38,33,.4)]">Last run</span>
              <span />
            </div>
            {trials.map((t) => {
              const tone = STATUS_TONE[t.latest_status] ?? STATUS_TONE.canceled;
              const label = t.name || t.tracent_id;
              return (
                <div
                  key={t.tracent_id}
                  className="grid grid-cols-1 sm:grid-cols-[1.7fr_.8fr_.6fr_.8fr_.5fr] gap-2.5 items-center px-3.5 py-2.5 border-t border-[rgba(28,38,33,.05)] hover:bg-[rgba(28,38,33,.04)] transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {t.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.image_url} alt="" className="w-7 h-7 flex-none rounded-md object-cover bg-white" />
                    ) : (
                      <span className="w-7 h-7 flex-none rounded-md flex items-center justify-center font-display text-[11.5px] text-background bg-gradient-to-br from-blue to-cyan">
                        {initials(label)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] text-foreground truncate">{label}</div>
                      <div className="text-[11px] text-foreground-faint truncate">
                        {t.description || "No description indexed for this agent yet."}
                      </div>
                    </div>
                  </div>
                  <span
                    className="justify-self-start inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono font-semibold text-[10.5px]"
                    style={{ background: tone.bg, color: tone.color }}
                  >
                    <span
                      className={`w-[5px] h-[5px] rounded-full flex-none ${tone.pulse ? "animate-pulse" : ""}`}
                      style={{ background: tone.color }}
                    />
                    {tone.label}
                  </span>
                  <span className="font-mono font-medium text-[11.5px] text-foreground-muted">{t.run_count}</span>
                  <span className="font-mono font-medium text-[11.5px] text-foreground-faint">{timeAgo(t.last_run_at)}</span>
                  <Link
                    href={`/marketplace/${t.tracent_id}/try`}
                    className="justify-self-end px-2.5 py-1 rounded-sm border border-[rgba(28,38,33,.14)] font-semibold text-[11.5px] text-foreground-muted no-underline hover:bg-[rgba(28,38,33,.05)]"
                  >
                    Open
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
