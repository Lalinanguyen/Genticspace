const GLASS_CIRCLE =
  "linear-gradient(120deg, rgba(238,241,234,.6), rgba(238,241,234,.28) 45%, rgba(238,241,234,.5))";
const GLASS_SHADOW =
  "0 10px 24px rgba(28,38,33,.09), inset 0 1.5px 1px rgba(255,255,255,.75), inset 0 -1.5px 1px rgba(28,38,33,.06)";

function FloatingCircle({ w, h, left, top }: { w: number; h: number; left: number; top: number }) {
  return (
    <div
      className="absolute rounded-full pointer-events-none"
      style={{
        background: GLASS_CIRCLE,
        backdropFilter: "blur(9px) saturate(1.6)",
        WebkitBackdropFilter: "blur(9px) saturate(1.6)",
        border: "1px solid rgba(255,255,255,.55)",
        boxShadow: GLASS_SHADOW,
        width: w,
        height: h,
        left,
        top,
      }}
    />
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="px-3.5 py-2 rounded font-mono font-medium text-[12.5px]"
      style={{
        border: "1px solid rgba(255,255,255,.6)",
        background: "linear-gradient(120deg, rgba(238,241,234,.65), rgba(238,241,234,.35))",
        backdropFilter: "blur(6px) saturate(1.5)",
        WebkitBackdropFilter: "blur(6px) saturate(1.5)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,.7), 0 2px 8px rgba(28,38,33,.06)",
        color: "rgba(28,38,33,.75)",
      }}
    >
      {children}
    </span>
  );
}

function Blob({
  left,
  top,
  radius,
  shineAngle,
  circles,
  icon,
  heading,
  tags,
}: {
  left: number;
  top: number;
  radius: string;
  shineAngle: number;
  circles: { w: number; h: number; pos: React.CSSProperties }[];
  icon: React.ReactNode;
  heading: React.ReactNode;
  tags: string[];
}) {
  return (
    <div
      className="absolute box-border"
      style={{
        left,
        top,
        width: 470,
        borderRadius: radius,
        background: GLASS_CIRCLE,
        backdropFilter: "blur(9px) saturate(1.6)",
        WebkitBackdropFilter: "blur(9px) saturate(1.6)",
        border: "1px solid rgba(255,255,255,.55)",
        boxShadow:
          "0 12px 32px rgba(28,38,33,.1), inset 0 1.5px 1px rgba(255,255,255,.75), inset 1.5px 0 1px rgba(255,255,255,.35), inset 0 -1.5px 1px rgba(28,38,33,.06)",
        padding: "40px 48px",
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: "inherit",
          background: `linear-gradient(${shineAngle}deg, transparent 30%, rgba(255,255,255,.3) 44%, rgba(255,255,255,.06) 50%, transparent 62%)`,
        }}
      />
      {circles.map((c, i) => (
        <div
          key={i}
          className="absolute rounded-full pointer-events-none"
          style={{
            background: GLASS_CIRCLE,
            backdropFilter: "blur(9px) saturate(1.6)",
            WebkitBackdropFilter: "blur(9px) saturate(1.6)",
            border: "1px solid rgba(255,255,255,.55)",
            boxShadow: GLASS_SHADOW,
            width: c.w,
            height: c.h,
            ...c.pos,
          }}
        />
      ))}
      <div className="relative z-[2] flex items-start gap-4 mb-5">
        {icon}
        <div className="font-display font-normal text-[31px] leading-[1.12] text-foreground tracking-[-.3px]">
          {heading}
        </div>
      </div>
      <div className="relative z-[2] flex flex-wrap gap-2.5 max-w-[400px]">
        {tags.map((t) => (
          <Tag key={t}>{t}</Tag>
        ))}
      </div>
    </div>
  );
}

export function HowItWorks() {
  return (
    <div
      className="w-full border-y border-border overflow-hidden relative"
      style={{
        background:
          "#E1E7DC radial-gradient(rgba(28,38,33,.09) 1px, transparent 1px) 0 0 / 24px 24px",
      }}
    >
      <div
        className="absolute -top-40 -right-[120px] w-[520px] h-[520px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(53,192,176,.18), transparent 68%)" }}
      />
      <div
        className="absolute -bottom-[200px] -left-[140px] w-[560px] h-[560px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle, rgba(7,42,200,.1), transparent 68%)" }}
      />
      <div className="max-w-[1440px] mx-auto px-[5%] py-[72px] box-border relative">
        <h2 className="font-display font-normal text-[30px] leading-[1.15] text-foreground tracking-[-.4px] mb-4">
          From &quot;I need an agent&quot; to deployed, three steps.
        </h2>
        <div className="overflow-x-auto no-scrollbar">
          <div className="w-[952px] mx-auto box-border" style={{ padding: "64px 0 0 60px" }}>
            <div className="relative" style={{ width: 1040, height: 560, transform: "scale(.8)", transformOrigin: "top left" }}>
              <svg
                viewBox="0 0 1040 560"
                width="1040"
                height="560"
                aria-hidden="true"
                className="absolute inset-0 pointer-events-none z-[3]"
                fill="none"
                stroke="#1C2621"
                strokeWidth="1.8"
                strokeDasharray="2 7"
                strokeLinecap="round"
              >
                <defs>
                  <marker id="dg-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                    <path d="M1 1l6 3.5L1 8" stroke="#1C2621" strokeWidth="1.6" strokeDasharray="none" fill="none" />
                  </marker>
                </defs>
                <circle cx="335" cy="152" r="4" fill="#1C2621" stroke="none" />
                <path d="M335 148C335 58 420 40 566 40" markerEnd="url(#dg-arrow)" />
                <circle cx="810" cy="214" r="4" fill="#1C2621" stroke="none" />
                <path d="M810 220L810 318" markerEnd="url(#dg-arrow)" />
                <circle cx="585" cy="388" r="4" fill="#1C2621" stroke="none" />
                <path d="M585 388C460 388 345 376 345 318" markerEnd="url(#dg-arrow)" />
              </svg>

              <FloatingCircle w={26} h={26} left={470} top={60} />
              <FloatingCircle w={14} h={14} left={520} top={120} />
              <FloatingCircle w={48} h={48} left={60} top={40} />
              <FloatingCircle w={18} h={18} left={150} top={110} />
              <FloatingCircle w={34} h={34} left={480} top={470} />
              <FloatingCircle w={16} h={16} left={420} top={520} />
              <FloatingCircle w={22} h={22} left={1000} top={280} />
              <FloatingCircle w={12} h={12} left={960} top={240} />

              <Blob
                left={-28}
                top={144}
                radius="74% 26% 38% 62% / 71% 32% 68% 29%"
                shineAngle={95}
                circles={[
                  { w: 92, h: 92, pos: { top: -58, left: -38 } },
                  { w: 34, h: 34, pos: { bottom: -20, right: -14 } },
                  { w: 14, h: 14, pos: { top: "40%", left: -42 } },
                ]}
                icon={
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1C2621" strokeWidth="2" strokeLinecap="round" className="flex-none mt-1">
                    <circle cx="10" cy="10" r="5.5" />
                    <path d="M14.5 14.5L20 20" />
                  </svg>
                }
                heading={
                  <>
                    <span style={{ color: "#072AC8" }}>Search</span> the marketplace in plain English
                  </>
                }
                tags={["Plain-English search", "Browse by industry"]}
              />

              <Blob
                left={546}
                top={-14}
                radius="29% 71% 67% 33% / 40% 73% 27% 60%"
                shineAngle={118}
                circles={[
                  { w: 104, h: 104, pos: { top: -60, right: -44 } },
                  { w: 40, h: 40, pos: { bottom: -26, left: -18 } },
                  { w: 16, h: 16, pos: { top: "30%", right: -46 } },
                ]}
                icon={
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1C2621" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none mt-1">
                    <circle cx="12" cy="12" r="6.5" />
                    <circle cx="12" cy="12" r="1.4" fill="#1C2621" stroke="none" />
                    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
                  </svg>
                }
                heading={
                  <>
                    <span style={{ color: "#178C7E" }}>Find</span> an agent that fits your needs and skillset
                  </>
                }
                tags={["Skills & capabilities", "Ratings & reviews", "Side-by-side compare"]}
              />

              <Blob
                left={546}
                top={306}
                radius="62% 38% 76% 24% / 30% 58% 42% 70%"
                shineAngle={75}
                circles={[
                  { w: 86, h: 86, pos: { top: -48, left: -52 } },
                  { w: 30, h: 30, pos: { bottom: -16, right: -24 } },
                  { w: 12, h: 12, pos: { top: -42, right: 120 } },
                ]}
                icon={
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#1C2621" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-none mt-1">
                    <path d="M7 17L17 7" />
                    <path d="M9 7h8v8" />
                  </svg>
                }
                heading={
                  <>
                    <span style={{ color: "#EF233C" }}>Deploy</span> your pick
                  </>
                }
                tags={["A2A endpoint", "Sandbox runs", "Cloud or on-prem"]}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
