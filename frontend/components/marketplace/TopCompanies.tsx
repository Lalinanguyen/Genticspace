import Link from "next/link";
import type { TopProvider } from "@/lib/types";

function initials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function TopCompanies({ providers }: { providers: TopProvider[] }) {
  if (providers.length === 0) return null;

  const loop = [...providers, ...providers];

  return (
    <div className="px-[5%] pb-10 box-border">
      <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
        <span className="font-display font-bold text-sm text-foreground">Top companies</span>
        <span className="font-medium text-[12.5px] text-foreground-faint">
          Verified builders shipping the most-followed agents
        </span>
      </div>
      <div
        className="overflow-hidden"
        style={{
          maskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)",
          WebkitMaskImage: "linear-gradient(90deg, transparent, #000 4%, #000 96%, transparent)",
        }}
      >
        <div
          className="flex gap-3.5"
          style={{ width: "max-content", animation: "conveyorBelt 28s linear infinite" }}
        >
          {loop.map((c, i) => (
            <Link
              href={`/company/${c.source}/${encodeURIComponent(c.name)}`}
              key={`${c.source}:${c.name}:${i}`}
              className="flex-none w-[220px] p-4 rounded bg-surface-2 border border-border shadow-[0_4px_12px_rgba(0,0,0,.15)] box-border no-underline hover:border-border-strong transition-colors"
            >
              <div className="flex items-center gap-2.5 mb-3">
                {c.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.image_url}
                    alt=""
                    className="w-9 h-9 rounded flex-none object-cover bg-surface border border-border"
                  />
                ) : (
                  <div className="w-9 h-9 rounded flex-none bg-gradient-to-br from-blue to-cyan flex items-center justify-center font-display font-bold text-[13px] text-white">
                    {initials(c.name)}
                  </div>
                )}
                <span className="font-display font-bold text-[13.5px] text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                  {c.name}
                </span>
              </div>
              {c.industry_tags && c.industry_tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {c.industry_tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-sm bg-blue-to/10 border border-blue-to/30 font-semibold text-[10px] text-blue-to"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-4">
                <div>
                  <div className="font-display font-bold text-sm text-foreground">{c.agent_count}</div>
                  <div className="font-medium text-[10.5px] text-foreground-faint">Agents</div>
                </div>
                <div>
                  <div className="font-display font-bold text-sm text-foreground">
                    {formatCount(c.followers)}
                  </div>
                  <div className="font-medium text-[10.5px] text-foreground-faint">Followers</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
