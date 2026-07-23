import Link from "next/link";
import { TypedSearchPlaceholder } from "./TypedSearchPlaceholder";

const EXAMPLE_TASKS = [
  "Triage support tickets",
  "Summarize contracts",
  "Reconcile transactions",
  "Screen resumes",
];

export function Hero() {
  return (
    <div className="relative w-full box-border overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/assets/hero-terrain.svg"
        alt=""
        aria-hidden="true"
        className="absolute -top-[60px] left-0 w-full h-[420px] object-cover object-top opacity-40 pointer-events-none z-0"
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 40"
        className="hidden md:block absolute top-[322px] right-[2.5%] w-[23px] h-[38px] opacity-55 pointer-events-none z-0"
        fill="none"
        stroke="#1C2621"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="12" cy="7" r="5" />
        <path d="M12 12v14M12 17l-7 4M12 17l7 3M12 26l-5 11M12 26l6 10" />
      </svg>

      <div className="relative z-[1] px-[5%] pt-20 pb-14 box-border max-w-[900px]">
        <h1 className="font-display font-normal text-[44px] md:text-[60px] leading-[1.05] text-foreground tracking-[-1.2px] mb-[22px] text-balance">
          Find an AI agent for the job. In plain English.
        </h1>
        <p className="text-lg leading-relaxed text-foreground max-w-[560px] mt-8 mb-[34px]">
          Stop wasting your time hiring engineers. Search, learn and deploy for your specific
          workflow today.
        </p>

        <div className="glass-panel-lg flex items-center gap-3 max-w-[600px] px-[22px] py-4 rounded-lg">
          <div className="relative w-[19px] h-[19px] border-2 border-foreground/40 rounded-full flex-none">
            <div className="absolute -bottom-[7px] -right-[7px] w-2 h-0.5 bg-foreground/40 rotate-45" />
          </div>
          <TypedSearchPlaceholder />
          <Link
            href="/marketplace"
            className="flex-none px-[18px] py-[9px] rounded bg-cyan font-bold text-[13.5px] text-[#08302B] whitespace-nowrap"
          >
            Search
          </Link>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {EXAMPLE_TASKS.map((task) => (
            <Link
              key={task}
              href="/marketplace"
              className="glass-chip px-3.5 py-2 rounded font-semibold text-[12.5px] text-foreground/82"
            >
              {task}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
