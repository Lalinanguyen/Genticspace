"use client";

import { useEffect, useRef, useState } from "react";

export function Swoosh({ style }: { style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 80 60"
      aria-hidden="true"
      className="absolute w-[76px] h-[56px] opacity-40 pointer-events-none"
      style={style}
      fill="none"
      stroke="#1C2621"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path
        d="M6 50c8-26 30-40 46-32 12 6 10 22-2 24-10 2-14-10-5-16 10-7 26-2 32 10"
        strokeDasharray="1.5 7"
      />
    </svg>
  );
}

export function SpotlightRail({
  sections,
}: {
  sections: { id: string; label: string; content: React.ReactNode }[];
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id);
  const refs = useRef<Record<string, HTMLDivElement | null>>({});

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        }
      },
      { rootMargin: "-40% 0px -40% 0px", threshold: 0 }
    );
    Object.values(refs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex gap-14 items-start flex-wrap relative">
      <div className="hidden md:block flex-none w-[170px] self-stretch relative">
        <Swoosh style={{ left: -14, top: -52 }} />
        <div
          className="absolute left-[2.5px] top-1.5 bottom-0 w-px pointer-events-none"
          style={{ background: "repeating-linear-gradient(180deg, rgba(28,38,33,.35) 0 2px, transparent 2px 8px)" }}
        />
        <Swoosh style={{ left: -14, bottom: -50, transform: "scaleY(-1)" }} />
        <div className="sticky top-[50vh] -translate-y-1/2 flex flex-col gap-3 font-mono text-[13.5px] pt-1.5 bg-background">
          {sections.map((s) => {
            const active = activeId === s.id;
            return (
              <div key={s.id} className="flex items-center gap-2 pl-4">
                <span
                  className="flex-1 min-w-0 transition-colors"
                  style={{ color: active ? "#178C7E" : "rgba(28,38,33,.4)" }}
                >
                  {s.label}
                </span>
                <span
                  className="w-1.5 h-1.5 rounded-full flex-none transition-colors"
                  style={{ background: active ? "#35C0B0" : "rgba(28,38,33,.2)" }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-w-0 flex flex-col">
        {sections.map((s, i) => (
          <div
            key={s.id}
            id={s.id}
            ref={(el) => {
              refs.current[s.id] = el;
            }}
            className={i > 0 ? "pt-20 border-t border-border" : "pb-20"}
          >
            {s.content}
          </div>
        ))}
      </div>
    </div>
  );
}
