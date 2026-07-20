import Link from "next/link";

const BULLETS = [
  "Showcase every agent in one place",
  "Earn a verified badge buyers trust",
  "Track views, follows and adoption over time",
];

const CONNECTS = ["Google ARD", "GitHub", "Hugging Face", "X", "Product Hunt"];

export function BuilderFeature() {
  return (
    <div className="relative w-full my-6 mb-[72px] bg-background border-y border-border overflow-hidden box-border">
      <div
        className="absolute -top-[120px] left-[5%] w-[360px] h-[360px] glow-blob"
        style={{ background: "radial-gradient(circle, rgba(7,42,200,.4), transparent 70%)" }}
      />
      <div className="relative z-[2] max-w-[1360px] mx-auto py-14 pl-[6%] box-border flex flex-wrap gap-12 items-center">
        <div className="relative flex-1 min-w-[280px] max-w-[460px]">
          <h2 className="font-display font-bold text-[32px] leading-tight text-foreground mb-4">
            Build your company profile
          </h2>
          <p className="text-foreground-muted text-[15px] leading-relaxed mb-6">
            Showcase every agent you ship in one place, earn a verified badge, and build the
            following that keeps people coming back to what you build next.
          </p>
          <div className="flex flex-col gap-3 mb-7">
            {BULLETS.map((b) => (
              <div key={b} className="flex items-center gap-2.5">
                <div className="w-2 h-2 rotate-45 bg-foreground flex-none" />
                <span className="font-medium text-sm text-[rgba(244,247,243,.8)]">{b}</span>
              </div>
            ))}
          </div>
          <Link
            href="/create-account"
            className="inline-flex px-6.5 py-3.5 rounded bg-foreground text-background font-semibold text-sm no-underline"
          >
            Create your profile
          </Link>
          <div className="mt-8">
            <div className="font-semibold text-[11.5px] text-foreground-faint tracking-wide uppercase mb-3">
              Connects with
            </div>
            <div className="flex flex-wrap gap-2">
              {CONNECTS.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-2 px-3.5 py-[7px] rounded-full bg-[rgba(244,247,243,.06)] border border-border-strong font-semibold text-xs text-[rgba(244,247,243,.75)]"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="relative flex-1 min-w-[320px]">
          <div
            className="absolute top-[22px] left-[22px] right-0 bottom-[-22px] rounded bg-[rgba(244,247,243,.03)] border border-[rgba(244,247,243,.08)]"
            style={{ transform: "rotate(2deg)" }}
          />
          <div
            className="relative p-7 pr-8 border border-border-strong glass-card box-border"
            style={{
              borderRadius: "4px 0 0 4px",
              background: "rgba(13,32,40,.9)",
              borderRight: "none",
              boxShadow: "-30px 30px 70px rgba(0,0,0,.45), inset 0 1px 0 rgba(255,255,255,.06)",
            }}
          >
            <div className="flex items-center gap-3.5 mb-[18px]">
              <div className="w-[52px] h-[52px] rounded bg-gradient-to-br from-blue to-cyan flex-none flex items-center justify-center font-display font-bold text-lg text-white">
                T
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-bold text-[17px] text-foreground">Tracent</span>
                  <span className="text-cyan text-sm">✓</span>
                </div>
                <div className="font-medium text-[12.5px] font-mono text-foreground-faint">tracent</div>
              </div>
              <Link href="/marketplace" className="ml-auto flex-none font-semibold text-[12.5px] text-cyan no-underline whitespace-nowrap">
                View profile →
              </Link>
            </div>
            <div className="flex gap-5.5 mb-[18px]">
              <div>
                <div className="font-display font-bold text-base text-foreground">6</div>
                <div className="font-medium text-[11px] text-foreground-faint">Agents listed</div>
              </div>
              <div>
                <div className="font-display font-bold text-base text-foreground">12.4k</div>
                <div className="font-medium text-[11px] text-foreground-faint">Followers</div>
              </div>
              <div>
                <div className="font-display font-bold text-base text-cyan">+18%</div>
                <div className="font-medium text-[11px] text-foreground-faint">Views this month</div>
              </div>
            </div>
            <div className="flex gap-2.5 mb-[18px]">
              <div className="flex-1 py-2.5 rounded font-semibold text-[12.5px] text-center text-background bg-foreground">
                Follow
              </div>
              <div className="flex-1 py-2.5 rounded font-semibold text-[12.5px] text-center text-foreground bg-[rgba(244,247,243,.06)] border border-[rgba(244,247,243,.14)]">
                Message
              </div>
            </div>
            <p className="text-[12.5px] leading-relaxed text-foreground-muted mb-4.5">
              The marketplace for discovering, comparing and deploying AI agents by industry,
              licensing and deployment model.
            </p>
            <div className="flex gap-2 flex-wrap mb-5">
              <span className="px-2.5 py-1 rounded-sm bg-blue-to/14 border border-blue-to/35 font-semibold text-[11px] text-blue-to">
                Marketplace
              </span>
              <span className="px-2.5 py-1 rounded-sm bg-cyan/14 border border-cyan/35 font-semibold text-[11px] text-cyan">
                Every Industry
              </span>
            </div>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-3 p-3 rounded bg-[rgba(244,247,243,.04)]">
                <div className="w-[34px] h-[34px] rounded bg-gradient-to-br from-cyan to-cyan-dark flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13.5px] text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                    Atlas Vision
                  </div>
                  <div className="text-[11.5px] text-foreground-faint">Customer Support · Commercial</div>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded bg-[rgba(244,247,243,.04)]">
                <div className="w-[34px] h-[34px] rounded bg-gradient-to-br from-blue-to to-blue flex-none" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[13.5px] text-foreground whitespace-nowrap overflow-hidden text-ellipsis">
                    Vitals Scribe
                  </div>
                  <div className="text-[11.5px] text-foreground-faint">Healthcare · Enterprise</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
