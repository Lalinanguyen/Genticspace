import Link from "next/link";

export function SandboxFeature() {
  return (
    <div className="relative w-full bg-background border-y border-border overflow-hidden box-border">
      <div
        className="absolute -top-[120px] right-[8%] w-[360px] h-[360px] glow-blob"
        style={{ background: "radial-gradient(circle, rgba(53,192,176,.4), transparent 70%)" }}
      />
      <div className="relative z-[2] max-w-[1220px] mx-auto px-[5%] py-[72px] box-border flex flex-wrap gap-14 items-start">
        <div className="flex-1 min-w-[300px] max-w-[460px]">
          <span className="font-mono font-semibold text-xs tracking-[1.5px] text-cyan-dark">
            DEPLOYMENT
          </span>
          <h2 className="font-display font-bold text-3xl leading-tight text-foreground mt-3 mb-[22px]">
            Try it live, then deploy with confidence
          </h2>
          <p className="text-[16.5px] leading-relaxed text-foreground-muted">
            Sandboxable agents run in a real embedded environment, right on the listing, no setup
            required. When you&apos;re ready, an AI-generated deployment guide walks you through
            getting it running on your own stack.
          </p>
        </div>

        <div className="flex-1 min-w-[320px] max-w-[460px] p-[26px] rounded bg-surface-2 border border-border-strong glass-card box-border flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3.5 flex-wrap">
            <div className="font-semibold text-base text-foreground max-w-[280px]">
              Sandbox Mode: try an agent before you commit
            </div>
            <span className="px-[11px] py-[5px] rounded font-mono font-semibold text-[11px] text-cyan-dark bg-cyan/12 border border-cyan/35 flex-none">
              536 live now
            </span>
          </div>
          <p className="text-[13.5px] leading-relaxed text-foreground-muted">
            Open any sandboxable listing to run the real thing directly in your browser, no
            install, no signup for the embed itself.
          </p>
          <div className="border-t border-border pt-4">
            <div className="font-semibold text-base text-foreground mb-1.5">
              Deployment guide, generated for you
            </div>
            <p className="text-[13.5px] leading-relaxed text-foreground-muted">
              Every listing can generate install and usage steps tailored to your experience
              level, grounded only in what the agent&apos;s own README or site actually
              documents.
            </p>
          </div>
          <Link
            href="/marketplace?sandboxable_only=true"
            className="self-start mt-1 font-bold text-sm text-background bg-foreground px-5 py-2.5 rounded no-underline"
          >
            Browse sandboxable agents
          </Link>
        </div>
      </div>
    </div>
  );
}
