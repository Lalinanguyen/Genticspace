import Link from "next/link";

const ACTIVITY = [
  {
    title: "Completion agent opens a pull request",
    body: "README and docs written, a compatible piece from the catalog merged in where the repo was thin.",
    tone: "cyan" as const,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="7" cy="6" r="2.6" />
        <circle cx="7" cy="18" r="2.6" />
        <circle cx="17" cy="18" r="2.6" />
        <path d="M7 8.6v6.8M17 15.4V12a4 4 0 0 0-4-4h-1.5" />
      </svg>
    ),
  },
  {
    title: "License check runs",
    body: "Only permissive or explicitly consented code is touched; terms show on the listing.",
    tone: "cyan" as const,
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round">
        <path d="M12 4l7 2.5v5c0 4-3 6.6-7 8-4-1.4-7-4-7-8v-5L12 4z" />
      </svg>
    ),
  },
  {
    title: "Held for human review",
    body: "The full diff waits in a queue for a maintainer; nothing publishes on its own.",
    tone: "amber" as const,
    icon: <span className="font-mono font-bold text-xs">‖</span>,
  },
  {
    title: "Listed on the Marketplace, verified",
    body: "Findable by every team searching for the job it solves.",
    tone: "cyan-solid" as const,
    icon: <span className="font-bold text-xs">✓</span>,
  },
  {
    title: "First sandbox trial starts",
    body: "A team runs it on their own work to see if it fits.",
    tone: "blue" as const,
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 4.5l12 7.5-12 7.5z" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    n: "01",
    title: "Code completion",
    body: "A completion agent finishes thin repos with genuinely compatible code from the catalog. Permissive licenses clear automatically; anything else is asked for first, with real terms.",
  },
  {
    n: "02",
    title: "Gain users",
    body: "Teams search in plain English for the job your agent solves. A finished, verified listing is what they find.",
  },
  {
    n: "03",
    title: "Win on results",
    body: "Sandbox trials let teams run your agent on their own work, so good agents win without a sales pitch.",
  },
];

function toneStyle(tone: "cyan" | "amber" | "cyan-solid" | "blue") {
  switch (tone) {
    case "amber":
      return { background: "#FBF0DF", border: "1px solid rgba(232,163,61,.4)", color: "#8A5B10" };
    case "cyan-solid":
      return { background: "#35C0B0", color: "#08302B" };
    case "blue":
      return { background: "#EDEFFA", border: "1px solid rgba(7,42,200,.25)", color: "#072AC8" };
    default:
      return { background: "#EAF7F4", border: "1px solid rgba(23,140,126,.3)", color: "#178C7E" };
  }
}

export function ForDevelopers() {
  return (
    <div className="relative z-[1] max-w-[1280px] mx-auto px-8 pt-8 pb-24 box-border">
      <span className="font-mono font-semibold text-xs tracking-[1.5px] text-cyan-dark">FOR DEVELOPERS</span>
      <h2 className="hero-heading font-display font-normal text-[48px] leading-[1.08] tracking-[-.8px] max-w-[680px] mt-4 mb-5 text-balance">
        Ship the repo. The marketplace does the rest.
      </h2>
      <p className="text-[16.5px] leading-relaxed text-foreground-muted max-w-[600px] mb-14 text-pretty">
        You write the code. Genticspace finishes the boring parts, puts it in front of teams
        already searching, and lets your results do the selling.
      </p>

      <div className="flex gap-11 items-center flex-wrap">
        <div className="flex-1 basis-[380px] min-w-[300px] max-w-[560px]">
          <div className="rounded-lg bg-white border border-[rgba(28,38,33,.12)] p-6 box-border" style={{ boxShadow: "0 14px 40px rgba(28,38,33,.1)" }}>
            <div className="flex items-center gap-2.5 mb-5">
              <span
                className="w-[30px] h-[30px] flex-none rounded-md flex items-center justify-center font-display font-normal text-xs text-white"
                style={{ background: "linear-gradient(135deg,#35C0B0,#178C7E)" }}
              >
                ✦
              </span>
              <span className="font-medium text-sm font-mono text-foreground">your-agent</span>
              <span className="ml-auto font-mono font-semibold text-[10px] tracking-wide text-foreground-faint">EXAMPLE</span>
            </div>
            <div className="relative flex flex-col gap-4.5">
              <div className="absolute left-[13px] top-2.5 bottom-2.5 w-px" style={{ background: "repeating-linear-gradient(180deg,rgba(28,38,33,.2) 0 3px,transparent 3px 8px)" }} />
              {ACTIVITY.map((a) => (
                <div key={a.title} className="relative flex gap-3.5 items-start">
                  <span className="w-[27px] h-[27px] flex-none rounded-full flex items-center justify-center" style={toneStyle(a.tone)}>
                    {a.icon}
                  </span>
                  <div className="min-w-0 pt-0.5">
                    <div className="font-semibold text-[13.5px] text-foreground">{a.title}</div>
                    <div className="text-xs leading-relaxed text-foreground-muted">{a.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 basis-[340px] min-w-[280px] flex flex-col gap-6">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-3.5">
              <span className="flex-none font-mono font-semibold text-[11px] text-cyan-dark pt-1.5">{s.n}</span>
              <div>
                <h3 className="font-display font-normal text-[22px] tracking-[-.2px] mb-1.5">{s.title}</h3>
                <p className="text-[14.5px] leading-relaxed text-foreground-muted">{s.body}</p>
              </div>
            </div>
          ))}
          <div className="flex gap-3.5 flex-wrap mt-1">
            <Link
              href="/contribute"
              className="font-bold text-sm text-[#08302B] px-6 py-[13px] rounded-xl whitespace-nowrap transition-transform hover:scale-[1.04]"
              style={{
                background: "linear-gradient(120deg, rgba(53,192,176,.85), rgba(53,192,176,.6) 45%, rgba(53,192,176,.8))",
                border: "1px solid rgba(255,255,255,.6)",
                boxShadow: "0 8px 24px rgba(23,140,126,.25)",
              }}
            >
              List an agent
            </Link>
            <Link href="/marketplace" className="glass-panel-lg font-bold text-sm text-foreground px-6 py-[13px] rounded-xl whitespace-nowrap transition-transform hover:scale-[1.04]">
              Browse the marketplace
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
