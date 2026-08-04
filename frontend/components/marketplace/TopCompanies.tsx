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
              className="flex-none w-[210px] flex items-center gap-3 p-3.5 rounded bg-surface-2 border border-border box-border no-underline hover:border-border-strong transition-colors"
            >
              {c.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.image_url}
                  alt=""
                  className="w-[38px] h-[38px] rounded flex-none object-cover bg-surface border border-border"
                />
              ) : (
                <div className="w-[38px] h-[38px] rounded flex-none bg-gradient-to-br from-blue to-cyan flex items-center justify-center font-display font-bold text-[13px] text-white">
                  {initials(c.name)}
                </div>
              )}
              <span className="font-display font-bold text-[13.5px] text-foreground overflow-hidden text-ellipsis whitespace-nowrap">
                {c.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
