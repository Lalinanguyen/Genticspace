const STEPS = [
  {
    title: "1. Search & compare",
    desc: "Describe the task in plain language. Browse results by industry, license or how they deploy.",
    color: "text-blue-to",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24">
        <path
          d="M6 3.5h7l4 4V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5Z"
          fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"
        />
        <circle cx="10.5" cy="13" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <line x1="12.8" y1="15.3" x2="15" y2="17.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "2. Check the details",
    desc: "Every listing shows its risk score, verified status, license and deployment options up front.",
    color: "text-cyan",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24">
        <path d="M2.05 11.7l4.5 4.5L14.5 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M8 11.7l4.5 4.5L21 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "3. Deploy in minutes",
    desc: "Get tailored installation and usage instructions for your stack: cloud, on-prem or API. No procurement process required.",
    color: "text-error",
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24">
        <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 9.5l2.5 2.5L7 14.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="12" y1="14.5" x2="16" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <div className="relative w-full bg-background border-y border-border box-border">
      <div className="max-w-[1220px] mx-auto px-[5%] py-[72px] box-border">
        <div className="text-center max-w-[560px] mx-auto mb-12">
          <h2 className="font-display font-bold text-3xl text-foreground mb-3">
            Go from &quot;I need an agent&quot; to deployed
          </h2>
          <p className="text-foreground-muted text-[15px] leading-relaxed">
            Three steps, built so anyone, not just engineers, can adopt AI with confidence.
          </p>
        </div>
        <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {STEPS.map((step) => (
            <div key={step.title} className="p-[26px_22px] rounded bg-[rgba(244,247,243,.04)] border border-border">
              <div className={`mb-4 ${step.color}`}>{step.icon}</div>
              <div className="font-display font-semibold text-[15px] text-foreground mb-1.5">
                {step.title}
              </div>
              <div className="text-[12.5px] leading-relaxed text-foreground-muted">{step.desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
