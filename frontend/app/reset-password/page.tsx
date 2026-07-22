"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Footer } from "@/components/ui/Footer";
import { forgotPassword, resetPassword, ApiError } from "@/lib/api";

const cardClass =
  "p-9 rounded bg-surface border border-border-strong glass-card box-border w-full max-w-[420px] text-center";
const inputClass =
  "w-full box-border px-3.5 py-3 rounded bg-[rgba(244,247,243,.06)] border border-border-strong text-foreground text-sm text-left focus:outline-none focus:border-cyan";
const labelClass = "block mb-1.5 font-semibold text-[12.5px] text-foreground-muted text-left";
const continueClass = "mt-6 w-full text-center px-7 py-[15px] rounded font-semibold text-[15px] cursor-pointer select-none";

function ContinueButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={continueClass}
      style={
        disabled
          ? { background: "rgba(244,247,243,.08)", color: "rgba(244,247,243,.4)", cursor: "default" }
          : {
              background: "linear-gradient(135deg,#072AC8,#2f4fe0)",
              color: "#fff",
              boxShadow: "0 10px 30px rgba(7,42,200,.45)",
            }
      }
    >
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-20 w-full box-border flex items-center px-[5%] py-[22px] bg-[rgba(0,23,31,.55)] backdrop-blur-[22px] border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] rounded bg-gradient-to-br from-blue to-cyan shadow-[0_0_22px_rgba(7,42,200,.55)]" />
          <span className="font-display font-bold text-lg text-foreground tracking-tight">Genticspace</span>
        </Link>
      </div>
      <main className="flex-1 flex items-center justify-center px-[5%] py-14 box-border">{children}</main>
      <Footer />
    </div>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [email, setEmail] = useState("");
  const [pwdNext, setPwdNext] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSendReset() {
    setBusy(true);
    setError(null);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send reset email");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitNewPassword() {
    if (!token) return;
    if (pwdNext !== pwdConfirm) {
      setError("Passwords don't match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, pwdNext);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That reset link is invalid or expired");
    } finally {
      setBusy(false);
    }
  }

  // A token in the URL means this page was opened from the reset email link.
  if (token) {
    if (done) {
      return (
        <Shell>
          <div className={cardClass}>
            <div className="w-14 h-14 mx-auto mb-5 flex items-center justify-center rounded-full border-2 border-cyan text-cyan text-2xl">
              ✓
            </div>
            <h1 className="font-display font-bold text-2xl text-foreground mb-2">Password updated</h1>
            <p className="text-foreground-muted text-sm leading-relaxed mb-6">
              Your password has been changed. You can sign in with your new password now.
            </p>
            <ContinueButton onClick={() => router.push("/create-account?mode=login")}>
              Sign in
            </ContinueButton>
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <div className={cardClass}>
          <h1 className="font-display font-bold text-2xl leading-tight text-foreground mb-1.5">
            Choose a new password
          </h1>
          <p className="text-foreground-muted text-sm leading-relaxed mb-6">
            Enter a new password for your account.
          </p>
          <div className="flex flex-col gap-3.5 mb-2">
            <div>
              <label className={labelClass}>New password</label>
              <input
                type="password"
                className={inputClass}
                placeholder="At least 8 characters"
                value={pwdNext}
                onChange={(e) => setPwdNext(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Confirm password</label>
              <input
                type="password"
                className={inputClass}
                placeholder="Re-enter your new password"
                value={pwdConfirm}
                onChange={(e) => setPwdConfirm(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-error text-[12.5px] font-semibold mt-3 text-left">{error}</p>}
          <ContinueButton
            disabled={busy || pwdNext.length < 8 || !pwdConfirm}
            onClick={handleSubmitNewPassword}
          >
            {busy ? "Updating…" : "Update password"}
          </ContinueButton>
        </div>
      </Shell>
    );
  }

  // No token: the request-a-reset-link flow.
  if (sent) {
    return (
      <Shell>
        <div className={cardClass}>
          <h1 className="font-display font-bold text-2xl leading-tight text-foreground mb-2">Check your email</h1>
          <p className="text-foreground-muted text-sm leading-relaxed mb-6">
            If an account exists for {email}, we&apos;ve sent a link to reset your password. It expires in 30
            minutes.
          </p>
          <Link href="/create-account?mode=login" className="text-cyan font-semibold text-sm">
            Back to sign in
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className={cardClass}>
        <h1 className="font-display font-bold text-2xl leading-tight text-foreground mb-1.5">
          Reset your password
        </h1>
        <p className="text-foreground-muted text-sm leading-relaxed mb-6">
          Enter your account email and we&apos;ll send you a link to reset your password.
        </p>
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
        {error && <p className="text-error text-[12.5px] font-semibold mt-3 text-left">{error}</p>}
        <ContinueButton disabled={busy || !email} onClick={handleSendReset}>
          {busy ? "Sending…" : "Send reset link"}
        </ContinueButton>
        <div className="mt-4 text-center text-sm text-foreground-muted">
          <Link href="/create-account?mode=login" className="text-cyan font-semibold">
            Back to sign in
          </Link>
        </div>
      </div>
    </Shell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}
