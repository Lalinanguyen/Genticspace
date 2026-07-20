import Link from "next/link";
import { HeroSearchDemo } from "./HeroSearchDemo";

export function Hero() {
  return (
    <div className="relative w-full px-[5%] pt-[72px] pb-20 overflow-hidden box-border">
      <div
        className="absolute inset-[-15%] animate-[gradientShift_16s_ease-in-out_infinite]"
        style={{
          background:
            "linear-gradient(128deg, #021620 0%, #072AC8 32%, #1C8FB0 58%, #35C0B0 78%, #021620 100%)",
          backgroundSize: "220% 220%",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[rgba(0,23,31,.1)] to-background to-[94%]" />
      <div
        className="absolute inset-0 opacity-60 pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.3' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div
        className="absolute inset-0 opacity-40 pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='n2'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.7 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n2)'/%3E%3C/svg%3E\")",
        }}
      />
      <div
        className="absolute -top-[140px] left-[60px] w-[420px] h-[420px] glow-blob"
        style={{ background: "radial-gradient(circle, rgba(7,42,200,.55), transparent 70%)" }}
      />
      <div
        className="absolute -bottom-[160px] right-0 w-[460px] h-[460px] glow-blob"
        style={{
          background: "radial-gradient(circle, rgba(53,192,176,.4), transparent 70%)",
          animationDelay: "1s",
        }}
      />

      <div className="relative max-w-[1440px] mx-auto flex flex-wrap gap-12 items-center">
        <div className="flex-1 min-w-[320px] max-w-[560px]">
          <h1 className="font-display font-bold text-[52px] leading-[1.08] text-foreground tracking-tight mb-5">
            Find AI tools for your use case
          </h1>
          <p className="text-[17px] leading-relaxed text-foreground-muted max-w-[480px] mb-8">
            Discover, compare, and deploy agents by industry, licensing and deployment type. Get
            usage instructions, adopt a new workflow in minutes.
          </p>
          <div className="flex gap-3.5">
            <Link
              href="/marketplace"
              className="px-7 py-[15px] rounded text-white font-semibold text-[15px] shadow-[0_10px_30px_rgba(7,42,200,.45)] no-underline"
              style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)" }}
            >
              Browse the marketplace
            </Link>
            <Link
              href="/create-account"
              className="px-7 py-[15px] rounded bg-[rgba(244,247,243,.08)] border border-border-strong text-foreground font-semibold text-[15px] no-underline"
            >
              List your agent
            </Link>
          </div>
        </div>

        <HeroSearchDemo />
      </div>
    </div>
  );
}
