import Link from "next/link";
import { listAgents } from "@/lib/api";

interface IndustryTile {
  name: string;
  desc?: string;
  color: string;
  bg: string;
  icon: (size: number) => React.ReactNode;
}

const headsetIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M4 13v-1a8 8 0 0 1 16 0v1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <rect x="3" y="13" width="4" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <rect x="17" y="13" width="4" height="6" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M19 19v1a2 2 0 0 1-2 2h-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const codeIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M9 8l-5 4 5 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M15 8l5 4-5 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const healthIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M8 12h2l1.2-2.6 1.8 4.6 1.2-2h1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const financeIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <line x1="5" y1="19" x2="5" y2="11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="12" y1="19" x2="12" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    <line x1="19" y1="19" x2="19" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
  </svg>
);

const legalIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <rect x="3.2" y="9.2" width="7.5" height="4.2" rx="1" fill="none" stroke="currentColor" strokeWidth="1.5" transform="rotate(-35 7 11.3)" />
    <line x1="9.5" y1="14" x2="15.5" y2="20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="4" y1="21" x2="14" y2="21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const retailIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M6 8h12l-1 12H7L6 8Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const marketingIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M3 10v4h3l6 4V6L6 10H3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M15 9a4 4 0 0 1 0 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const educationIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <path d="M12 5 2 9.5 12 14l10-4.5L12 5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const hrIcon = (size: number) => (
  <svg width={size} height={size} viewBox="0 0 24 24">
    <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M3.5 19c.5-3.5 3-5 5.5-5s5 1.5 5.5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    <circle cx="17.3" cy="9" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
    <path d="M15.7 19c.3-2.5 1.8-4 3.5-4.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

const HERO_TILES: IndustryTile[] = [
  {
    name: "Customer Support",
    desc: "Automate ticket triage, live chat and after-hours coverage.",
    color: "text-cyan",
    bg: "bg-cyan/14",
    icon: headsetIcon,
  },
  {
    name: "Software Engineering",
    desc: "Pair-program, review pull requests and ship code with an agent teammate.",
    color: "text-blue-to",
    bg: "bg-blue-to/14",
    icon: codeIcon,
  },
];

const SMALL_TILES: IndustryTile[] = [
  { name: "Healthcare", color: "text-error", bg: "bg-error/14", icon: healthIcon },
  { name: "Finance & Fintech", color: "text-cyan", bg: "bg-cyan/14", icon: financeIcon },
  { name: "Legal", color: "text-blue-to", bg: "bg-blue-to/14", icon: legalIcon },
  { name: "Retail & E-commerce", color: "text-error", bg: "bg-error/14", icon: retailIcon },
  { name: "Marketing", color: "text-cyan", bg: "bg-cyan/14", icon: marketingIcon },
  { name: "Education", color: "text-blue-to", bg: "bg-blue-to/14", icon: educationIcon },
  { name: "HR & Recruiting", color: "text-error", bg: "bg-error/14", icon: hrIcon },
];

async function getIndustryCount(industry: string): Promise<number | null> {
  try {
    const res = await listAgents({ industry, page: 1, page_size: 1 });
    return res.total;
  } catch {
    return null;
  }
}

export async function CapabilityShowcase() {
  const allTiles = [...HERO_TILES, ...SMALL_TILES];
  const counts = await Promise.all(allTiles.map((tile) => getIndustryCount(tile.name)));
  const countByName = new Map(allTiles.map((tile, i) => [tile.name, counts[i]]));

  return (
    <div className="relative w-full bg-background border-y border-border overflow-hidden box-border">
      <div
        className="absolute -top-[100px] right-[10%] w-[360px] h-[360px] glow-blob"
        style={{ background: "radial-gradient(circle, rgba(7,42,200,.4), transparent 70%)" }}
      />
      <div className="relative z-[2] max-w-[1220px] mx-auto px-[5%] py-16 pb-[72px] box-border flex flex-wrap gap-10 items-start">
        <div className="flex-1 min-w-[260px] max-w-[360px]">
          <h2 className="font-display font-bold text-3xl leading-tight text-foreground mb-4">
            Built for every industry adopting AI
          </h2>
          <p className="text-foreground-muted text-[15px] leading-relaxed mb-6">
            Browse agents grouped by the work they do, no engineering background required.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 font-semibold text-sm text-cyan no-underline"
          >
            Explore by industry →
          </Link>
        </div>

        <div className="flex-[2] min-w-[480px]">
          <div className="grid grid-cols-2 gap-4 mb-4">
            {HERO_TILES.map((tile) => {
              const count = countByName.get(tile.name);
              return (
                <Link
                  key={tile.name}
                  href={`/marketplace?industry=${encodeURIComponent(tile.name)}`}
                  className="p-6 rounded bg-[rgba(244,247,243,.04)] border border-border no-underline hover:border-border-strong transition-colors"
                >
                  <div className={`w-11 h-11 rounded flex items-center justify-center mb-4 ${tile.bg} ${tile.color}`}>
                    {tile.icon(24)}
                  </div>
                  <div className="font-display font-bold text-[17px] text-foreground mb-1.5">{tile.name}</div>
                  <div className="text-[13px] leading-relaxed text-foreground-muted mb-3">{tile.desc}</div>
                  {count !== null && count !== undefined && (
                    <div className="text-xs font-semibold text-foreground-faint">
                      {count.toLocaleString()} agent{count === 1 ? "" : "s"} listed
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
            {SMALL_TILES.map((tile) => {
              const count = countByName.get(tile.name);
              return (
                <Link
                  key={tile.name}
                  href={`/marketplace?industry=${encodeURIComponent(tile.name)}`}
                  className="p-4 rounded bg-[rgba(244,247,243,.04)] border border-border no-underline hover:border-border-strong transition-colors"
                >
                  <div className={`w-8 h-8 rounded flex items-center justify-center mb-3 ${tile.bg} ${tile.color}`}>
                    {tile.icon(17)}
                  </div>
                  <div className="font-display font-semibold text-[13px] text-foreground mb-1">{tile.name}</div>
                  {count !== null && count !== undefined && (
                    <div className="text-[11px] font-medium text-foreground-faint">
                      {count.toLocaleString()} agent{count === 1 ? "" : "s"}
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
