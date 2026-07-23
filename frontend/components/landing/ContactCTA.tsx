import Link from "next/link";

export function ContactCTA() {
  return (
    <div className="px-[5%] pb-[72px] box-border">
      <div
        className="relative overflow-hidden rounded box-border px-[6%] py-16"
        style={{
          background: "linear-gradient(135deg, rgba(53,192,176,.24), rgba(53,192,176,.05))",
          border: "1px solid rgba(28,38,33,.12)",
          boxShadow: "0 3px 12px rgba(28,38,33,.07)",
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 440 280"
          preserveAspectRatio="xMaxYMax meet"
          className="hidden md:block absolute right-0 bottom-2 h-[58%] max-h-[150px] opacity-35 pointer-events-none z-0"
          fill="none"
          stroke="#1C2621"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path
            d="M40 210c40-90 120-120 190-96 55 19 68 78 30 96-30 14-62-10-50-40 14-34 76-42 128-16"
            strokeWidth="5"
            strokeDasharray="2 10"
          />
          <path d="M330 148l16-34M338 152l30-22M342 162l36-6" strokeWidth="5" />
        </svg>

        <div className="relative z-[1] flex items-center justify-between gap-8 flex-wrap">
          <div className="max-w-[520px]">
            <h2 className="font-display font-normal text-[40px] leading-[1.1] text-foreground tracking-[-.6px] mb-3">
              Interested? <span className="italic text-cyan-dark">Let&apos;s talk.</span>
            </h2>
            <p className="text-[15.5px] leading-relaxed text-foreground/70">
              Whether you&apos;re hunting for the right agent or ready to list your own, we&apos;ll
              help you find the shortest path to deployed.
            </p>
          </div>
          <div className="flex flex-col gap-3 flex-none">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2.5 font-bold text-sm text-background bg-foreground px-[30px] py-[15px] rounded"
            >
              ✉ Contact us
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-2.5 font-bold text-sm text-foreground border border-foreground/30 bg-[rgba(238,241,234,.6)] px-[30px] py-[15px] rounded"
            >
              Browse first →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
