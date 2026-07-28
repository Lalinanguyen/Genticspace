"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLE_TASKS = ["Triage support tickets", "Summarize contracts", "Reconcile transactions", "Screen resumes"];

export function Hero() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function submitSearch(q: string) {
    const query = q.trim();
    router.push(`/marketplace${query ? `?q=${encodeURIComponent(query)}` : ""}`);
  }

  return (
    <div className="relative w-full overflow-hidden box-border">
      <div className="absolute inset-0 pointer-events-none z-0" aria-hidden="true">
        <div
          className="absolute rounded-full"
          style={{ top: -80, right: "2%", width: 380, height: 380, background: "#3cb8a2", opacity: 0.35, filter: "blur(90px)" }}
        />
        <div
          className="absolute rounded-full"
          style={{ top: 120, right: "22%", width: 260, height: 260, background: "#3540c0", opacity: 0.3, filter: "blur(80px)" }}
        />
        <div
          className="absolute rounded-full"
          style={{ top: 260, right: "6%", width: 220, height: 220, background: "#e8404f", opacity: 0.28, filter: "blur(75px)" }}
        />
        <div
          className="absolute rounded-full"
          style={{ top: 40, right: "38%", width: 180, height: 180, background: "#e8a23c", opacity: 0.25, filter: "blur(70px)" }}
        />
      </div>

      <div className="relative z-[1] px-[5%] pt-20 pb-14 box-border max-w-[900px]">
        <h1 className="m-0 mb-[22px] font-display font-normal text-[60px] leading-[1.05] text-foreground tracking-[-1.2px]" style={{ textWrap: "balance" }}>
          Find an AI agent for the job. In plain English.
        </h1>
        <p className="mt-8 mb-[34px] font-body text-lg leading-[1.6] text-foreground max-w-[560px]">
          Stop wasting your time hiring engineers. Search, learn and deploy for your specific workflow today.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitSearch(value);
          }}
          className="glass-panel-lg flex items-center gap-3 max-w-[600px] px-[22px] py-4 rounded-[14px] box-border"
        >
          <div className="w-[19px] h-[19px] border-2 border-[rgba(28,38,33,.4)] rounded-full relative flex-none">
            <div
              className="absolute -bottom-[7px] -right-[7px] w-2 h-0.5 bg-[rgba(28,38,33,.4)]"
              style={{ transform: "rotate(45deg)" }}
            />
          </div>
          <div className="flex-1 relative min-w-0">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='Try "summarize customer emails"...'
              className="w-full bg-transparent border-none outline-none font-body text-base text-foreground placeholder:text-[rgba(28,38,33,.45)] relative z-[1]"
              aria-label="Search the marketplace"
            />
          </div>
          <button
            type="submit"
            className="font-bold text-[13.5px] text-[#08302B] bg-cyan px-[18px] py-[9px] rounded whitespace-nowrap flex-none cursor-pointer"
          >
            Search
          </button>
        </form>

        <div className="flex flex-wrap gap-2 mt-4">
          {EXAMPLE_TASKS.map((task) => (
            <button
              key={task}
              type="button"
              onClick={() => submitSearch(task)}
              className="glass-panel px-3.5 py-2 rounded font-semibold text-[12.5px] text-[rgba(28,38,33,.82)] cursor-pointer"
            >
              {task}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
