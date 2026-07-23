"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getDeploymentGuide, askDeploymentGuide, ApiError } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

function HelpBot({ genticspaceId, token }: { genticspaceId: string; token: string | null }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  async function send() {
    const question = input.trim();
    if (!question || sending) return;
    setInput("");
    setError(null);
    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setSending(true);
    try {
      const res = await askDeploymentGuide(genticspaceId, question, messages, token ?? undefined);
      setMessages([...nextMessages, { role: "assistant", content: res.answer }]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't get an answer right now.");
    } finally {
      setSending(false);
    }
  }

  if (!open) {
    return (
      <div
        onClick={() => setOpen(true)}
        className="mt-4 flex items-center gap-2 cursor-pointer select-none w-fit"
      >
        <span className="w-7 h-7 rounded-full flex-none flex items-center justify-center font-display font-normal text-[11px] text-background bg-gradient-to-br from-cyan to-cyan-deep">
          AI
        </span>
        <span className="font-semibold text-[13px] text-cyan">Ask a question about setting this up</span>
      </div>
    );
  }

  return (
    <div className="glass-panel mt-4 rounded overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full flex-none flex items-center justify-center font-display font-normal text-[10px] text-background bg-gradient-to-br from-cyan to-cyan-deep">
            AI
          </span>
          <span className="font-semibold text-[12.5px] text-foreground">Setup help</span>
        </div>
        <span
          onClick={() => setOpen(false)}
          className="cursor-pointer text-foreground-faint hover:text-foreground text-sm leading-none px-1"
        >
          ×
        </span>
      </div>

      {messages.length > 0 && (
        <div ref={scrollRef} className="flex flex-col gap-2.5 px-4 py-3 max-h-[280px] overflow-y-auto">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] px-3 py-2 rounded text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                m.role === "user" ? "self-end bg-cyan/16 text-foreground" : "self-start bg-surface-2 text-foreground/85"
              }`}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div className="self-start max-w-[85%] px-3 py-2 rounded text-[12.5px] text-foreground-faint bg-surface-2">
              Thinking…
            </div>
          )}
        </div>
      )}

      {error && <p className="px-4 text-[12px] text-error mb-1">{error}</p>}

      <div className="flex items-center gap-2 p-3 border-t border-border">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="e.g. What if step 2 fails?"
          className="glass-chip flex-1 min-w-0 box-border px-3 py-2 rounded-sm text-foreground text-[12.5px] focus:outline-none focus:border-cyan"
        />
        <div
          onClick={sending ? undefined : send}
          className="flex-none px-3.5 py-2 rounded-sm font-semibold text-[12px] cursor-pointer text-white"
          style={{
            background: input.trim() && !sending ? "linear-gradient(135deg,#072AC8,#2f4fe0)" : "rgba(28,38,33,.08)",
            color: input.trim() && !sending ? "#fff" : "rgba(28,38,33,.4)",
          }}
        >
          Ask
        </div>
      </div>
    </div>
  );
}

export function DeploymentGuideSection({ genticspaceId }: { genticspaceId: string }) {
  const { user, token, loading: authLoading } = useAuth();
  const [instructions, setInstructions] = useState<string | null>(null);
  const [hasReadme, setHasReadme] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // The user's AI experience level is an internal signal from their profile,
  // not something they pick per-agent — instructions are always tailored to
  // it automatically, no manual level switcher.
  useEffect(() => {
    if (authLoading || loaded || loading) return;
    const level = user?.experience_level || "Intermediate";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount, guarded above
    setLoading(true);
    setError(null);
    getDeploymentGuide(genticspaceId, level, token ?? undefined)
      .then((guide) => {
        setInstructions(guide.instructions);
        setHasReadme(guide.has_readme);
        setLoaded(true);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Couldn't load deployment instructions.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, genticspaceId, token]);

  return (
    <div className="glass-panel p-[26px] rounded box-border">
      <span className="font-display font-normal text-sm text-foreground block mb-4">Deployment guide</span>

      {loading && <p className="text-[13.5px] text-foreground-muted">Generating instructions...</p>}

      {error && <p className="text-[13px] text-error">{error}</p>}

      {loaded && !loading && !error && (
        <>
          {!hasReadme && (
            <p className="text-[12.5px] text-foreground-faint mb-3">
              No source material has been indexed for this agent yet.
            </p>
          )}
          <div className="text-[13.5px] leading-relaxed text-foreground-muted whitespace-pre-wrap">
            {instructions}
          </div>

          {hasReadme && <HelpBot genticspaceId={genticspaceId} token={token} />}
        </>
      )}
    </div>
  );
}
