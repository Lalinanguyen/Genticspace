import Link from "next/link";

export function CtaBand() {
  return (
    <div className="max-w-[1280px] mx-auto px-8 pb-[88px] box-border">
      <div
        className="relative overflow-hidden rounded-xl box-border px-[6%] py-16"
        style={{
          background: "linear-gradient(180deg,#7FA9E2 0%,#A5C3EA 55%,#CBDCF2 100%)",
          border: "1px solid rgba(255,255,255,.65)",
          boxShadow: "0 10px 34px rgba(28,38,33,.12)",
        }}
      >
        <div
          className="absolute pointer-events-none"
          style={{
            left: "-6%",
            bottom: "-46%",
            width: "60%",
            height: "110%",
            background:
              "radial-gradient(closest-side at 30% 60%,rgba(255,255,255,.95),rgba(255,255,255,.55) 55%,rgba(255,255,255,0) 75%),radial-gradient(closest-side at 62% 40%,rgba(255,255,255,.85),rgba(255,255,255,0) 70%)",
            filter: "blur(2px)",
          }}
        />
        <div
          className="absolute pointer-events-none"
          style={{
            right: "-4%",
            bottom: "-58%",
            width: "55%",
            height: "120%",
            background:
              "radial-gradient(closest-side at 55% 50%,rgba(255,255,255,.9),rgba(255,255,255,.5) 55%,rgba(255,255,255,0) 75%),radial-gradient(closest-side at 25% 65%,rgba(255,255,255,.8),rgba(255,255,255,0) 70%)",
            filter: "blur(3px)",
          }}
        />
        <div className="relative flex items-center justify-between gap-9 flex-wrap">
          <div className="max-w-[560px]">
            <h2 className="font-display font-normal text-[46px] leading-[1.1] tracking-[-.7px] mb-3.5 text-balance" style={{ color: "#12233F" }}>
              Deploy your first agent <span className="italic" style={{ color: "#FDFEFC" }}>today</span>
            </h2>
            <p className="text-base leading-relaxed" style={{ color: "rgba(18,35,63,.75)" }}>
              Free to search and trial. You pay only when an agent goes to production.
            </p>
          </div>
          <div className="flex gap-3.5 flex-wrap flex-none">
            <Link
              href="/create-account"
              className="font-bold text-[14.5px] px-[30px] py-[15px] rounded-xl whitespace-nowrap transition-transform hover:scale-[1.04]"
              style={{
                color: "#08302B",
                background: "linear-gradient(120deg, rgba(53,192,176,.85), rgba(53,192,176,.6) 45%, rgba(53,192,176,.8))",
                border: "1px solid rgba(255,255,255,.6)",
                boxShadow: "0 8px 24px rgba(23,140,126,.25)",
              }}
            >
              Sign up free
            </Link>
            <Link
              href="/contact"
              className="font-bold text-[14.5px] px-[30px] py-[15px] rounded-xl whitespace-nowrap transition-transform hover:scale-[1.04]"
              style={{
                color: "#12233F",
                background: "linear-gradient(120deg, rgba(255,255,255,.55), rgba(255,255,255,.28) 45%, rgba(255,255,255,.45))",
                border: "1px solid rgba(255,255,255,.65)",
                boxShadow: "0 8px 24px rgba(22,48,107,.14)",
              }}
            >
              Talk to us
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
