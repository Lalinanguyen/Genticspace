"use client";

import { useState } from "react";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { useAuth } from "@/lib/auth";
import { sendContactMessage, ApiError } from "@/lib/api";

const TOPICS = ["General question", "Listing an agent", "Partnership", "Report an issue"];

const inputClass =
  "w-full box-border px-3.5 py-3 rounded bg-[rgba(244,247,243,.06)] border border-border-strong text-foreground text-sm focus:outline-none focus:border-cyan";
const labelClass = "block mb-1.5 font-semibold text-[12.5px] text-foreground-muted";

export default function ContactPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState(user?.email || "");
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    setBusy(true);
    setError(null);
    try {
      await sendContactMessage(email, topic, message);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send your message");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[560px] mx-auto px-[5%] py-16 box-border">
        {sent ? (
          <div className="text-center">
            <div className="w-14 h-14 mx-auto mb-5 flex items-center justify-center rounded-full border-2 border-cyan text-cyan text-2xl">
              ✓
            </div>
            <h1 className="font-display font-bold text-[26px] text-foreground mb-2">Message sent</h1>
            <p className="text-foreground-muted text-sm leading-relaxed">
              Thanks for reaching out. We&apos;ll get back to you at {email}.
            </p>
          </div>
        ) : (
          <>
            <h1 className="font-display font-bold text-[30px] text-foreground mb-1.5">Contact us</h1>
            <p className="text-foreground-muted text-sm mb-8">
              Questions, partnership ideas, or something not working right? Send us a note.
            </p>

            <div className="flex flex-col gap-4">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="ada@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass}>Subject</label>
                <select className={inputClass} value={topic} onChange={(e) => setTopic(e.target.value)}>
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Message</label>
                <textarea
                  className={`${inputClass} min-h-[140px] resize-y`}
                  placeholder="How can we help?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {error && <p className="text-error text-[12.5px] font-semibold">{error}</p>}

              <div
                onClick={busy || !email || !message.trim() ? undefined : handleSend}
                className="self-start px-7 py-[15px] rounded font-semibold text-[15px] cursor-pointer text-white"
                style={
                  busy || !email || !message.trim()
                    ? { background: "rgba(244,247,243,.08)", color: "rgba(244,247,243,.4)", cursor: "default" }
                    : { background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" }
                }
              >
                {busy ? "Sending…" : "Send message"}
              </div>
            </div>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
