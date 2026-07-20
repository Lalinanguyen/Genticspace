const INDUSTRIES = [
  "Healthcare",
  "Customer Support",
  "Finance & Fintech",
  "Legal",
  "Retail & E-commerce",
  "Marketing",
  "Software Engineering",
  "Education",
  "HR & Recruiting",
  "Real Estate",
  "Manufacturing",
  "Travel & Hospitality",
  "Insurance",
];

const CONVEYOR_COMPANIES = [
  { name: "Cognition", logo: "/assets/logo-cognition.png", bg: "#fff" },
  { name: "Adept AI", logo: "/assets/logo-adept.png", bg: "#241f1c" },
  { name: "Decagon", logo: "/assets/logo-decagon.png", bg: "#0a0a0a" },
  { name: "CrewAI", logo: "/assets/logo-crewai.png", bg: "#fff" },
  { name: "Multion", logo: "/assets/logo-multion.png", bg: "#fff" },
  { name: "Imbue", logo: "/assets/logo-imbue.png", bg: "#f6efdd" },
  { name: "Ema", logo: "/assets/logo-ema.png", bg: "#1c8a44" },
  { name: "Induced AI", logo: "/assets/logo-induced.png", bg: "#000" },
];

const MINI_AGENTS = [
  { name: "Claude Cowork", desc: "Shared AI workspace for teams", logo: "/assets/claude-cowork-icon.png" },
  { name: "Cursor", desc: "AI pair programmer for code", logo: "/assets/cursor-icon.png" },
  { name: "Sierra", desc: "Customer support, automated", logo: "/assets/sierra-icon.png" },
  { name: "Harvey", desc: "Contract review for legal teams", logo: "/assets/harvey-icon.png" },
  { name: "GDevelop", desc: "No-code game development", logo: "/assets/gdevelop-icon.png" },
  { name: "Athelas AI", desc: "Medical billing & clinical notes", logo: "/assets/athelas-icon.png" },
];

export function CapabilityShowcase() {
  const conveyor = [...CONVEYOR_COMPANIES, ...CONVEYOR_COMPANIES];

  return (
    <div className="relative w-full bg-background border-y border-border overflow-hidden box-border">
      <div
        className="absolute -top-[100px] right-[10%] w-[360px] h-[360px] glow-blob"
        style={{ background: "radial-gradient(circle, rgba(7,42,200,.4), transparent 70%)" }}
      />
      <div className="relative z-[2] max-w-[1220px] mx-auto px-[5%] py-16 pb-[72px] box-border">
        <div className="text-center max-w-[640px] mx-auto mb-7">
          <h2 className="font-display font-bold text-3xl leading-tight text-foreground mb-4">
            Built for every industry adopting AI
          </h2>
          <p className="text-foreground-muted text-[15px] leading-relaxed">
            Browse agents grouped by the work they do, no engineering background required.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 max-w-[760px] mx-auto mb-10">
          {INDUSTRIES.map((cap) => (
            <span
              key={cap}
              className="px-3.5 py-[7px] rounded bg-[rgba(53,192,176,.14)] border border-[rgba(53,192,176,.35)] font-semibold text-xs text-cyan"
            >
              {cap}
            </span>
          ))}
        </div>

        <div className="w-full overflow-x-auto no-scrollbar box-border">
          <div className="relative w-[1100px] max-w-none mx-auto rounded bg-background border border-border shadow-[0_30px_70px_rgba(0,0,0,.45)] overflow-hidden box-border p-7 pointer-events-none select-none">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3.5 mb-5">
              <div className="flex items-center gap-2">
                <div className="w-[18px] h-[18px] rounded bg-gradient-to-br from-blue to-cyan flex-none" />
                <span className="font-display font-bold text-[13px] text-[rgba(244,247,243,.85)]">Tracent</span>
              </div>
              <div className="flex items-center gap-4.5 justify-self-center">
                <span className="font-semibold text-[11px] text-foreground border-b-2 border-cyan pb-0.5">Home</span>
                <span className="font-medium text-[11px] text-[rgba(244,247,243,.45)]">Marketplace</span>
                <span className="font-medium text-[11px] text-[rgba(244,247,243,.45)]">Contribute</span>
              </div>
              <span className="font-medium text-[11px] text-[rgba(244,247,243,.4)] justify-self-end">Sign in</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-3 rounded bg-[rgba(244,247,243,.06)] border border-border mb-5">
              <div className="w-[13px] h-[13px] border-[1.5px] border-[rgba(244,247,243,.4)] rounded-full flex-none" />
              <span className="text-xs text-[rgba(244,247,243,.45)]">Try &quot;triage support tickets&quot;...</span>
            </div>

            <div
              className="overflow-hidden mb-5"
              style={{
                maskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
                WebkitMaskImage: "linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)",
              }}
            >
              <div
                className="flex gap-2.5"
                style={{ width: "max-content", animation: "conveyorBelt 22s linear infinite" }}
              >
                {conveyor.map((c, i) => (
                  <div
                    key={`${c.name}-${i}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[rgba(244,247,243,.05)] border border-[rgba(244,247,243,.1)] flex-none"
                  >
                    <div
                      className="w-4 h-4 rounded-full flex-none overflow-hidden"
                      style={{ background: c.bg }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.logo} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="font-semibold text-[10px] text-[rgba(244,247,243,.65)] whitespace-nowrap">
                      {c.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3.5">
              {MINI_AGENTS.map((agent) => (
                <div key={agent.name} className="p-4 rounded bg-[rgba(244,247,243,.045)] border border-border">
                  <div className="w-8 h-8 rounded mb-2.5 overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={agent.logo} alt="" className="w-full h-full object-cover" />
                  </div>
                  <div className="font-display font-bold text-xs text-foreground mb-1">{agent.name}</div>
                  <div className="text-[10px] leading-tight text-foreground-faint">{agent.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
