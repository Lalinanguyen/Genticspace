"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { requestOtp, verifyOtp, signup, login, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ProgressBar, type WizardStep } from "./ProgressBar";

const PURPOSES = [
  { id: "support", label: "Customer Support" },
  { id: "swe", label: "Software Engineering" },
  { id: "healthcare", label: "Healthcare" },
  { id: "finance", label: "Finance & Fintech" },
  { id: "legal", label: "Legal" },
  { id: "retail", label: "Retail & E-commerce" },
  { id: "marketing", label: "Marketing" },
  { id: "education", label: "Education" },
  { id: "hr", label: "HR & Recruiting" },
  { id: "ugc", label: "UGC & Creators" },
  { id: "art", label: "Art & Design" },
  { id: "nonprofit", label: "Nonprofit" },
  { id: "other", label: "Other" },
];

const EXPERIENCE_LEVELS = [
  { level: "Beginner", desc: "New to AI tools and agents" },
  { level: "Intermediate", desc: "Used a few AI tools before" },
  { level: "Advanced", desc: "Regularly build with or deploy AI" },
] as const;

const cardClass =
  "p-9 rounded bg-surface border border-border-strong glass-card box-border w-full max-w-[480px]";
const inputClass =
  "w-full box-border px-3.5 py-3 rounded bg-[rgba(244,247,243,.06)] border border-border-strong text-foreground text-sm focus:outline-none focus:border-cyan";
const labelClass = "block mb-1.5 font-semibold text-[12.5px] text-foreground-muted";
const continueClass =
  "mt-6 text-center px-7 py-[15px] rounded font-semibold text-[15px] cursor-pointer select-none";

function ContinueButton({
  onClick,
  disabled,
  children = "Continue",
}: {
  onClick: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
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

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="inline-flex items-center gap-1.5 mb-4.5 cursor-pointer font-semibold text-[12.5px] text-foreground-muted"
    >
      ← Back
    </div>
  );
}

interface FormState {
  accountType: "individual" | "business";
  name: string;
  companyName: string;
  email: string;
  password: string;
  terms: boolean;
  experienceLevel: "Beginner" | "Intermediate" | "Advanced";
  useCase: string;
  purposes: string[];
  otherPurpose: string;
  bio: string;
  connects: { github: string; x: string; linkedin: string; website: string; huggingface: string; other: string };
}

const INITIAL_FORM: FormState = {
  accountType: "individual",
  name: "",
  companyName: "",
  email: "",
  password: "",
  terms: false,
  experienceLevel: "Beginner",
  useCase: "",
  purposes: [],
  otherPurpose: "",
  bio: "",
  connects: { github: "", x: "", linkedin: "", website: "", huggingface: "", other: "" },
};

export function Wizard({ initialStep = "role" }: { initialStep?: WizardStep }) {
  const router = useRouter();
  const { setSession } = useAuth();

  const [step, setStep] = useState<WizardStep>(initialStep);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState<string | null>(null);
  const [emailVerifiedToken, setEmailVerifiedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  const isBusiness = form.accountType === "business";

  async function handleLogin() {
    setBusy(true);
    setError(null);
    try {
      const res = await login(loginEmail, loginPassword);
      setSession(res.access_token, res.user);
      router.push("/marketplace");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Incorrect email or password");
    } finally {
      setBusy(false);
    }
  }

  const canSubmitDetails = !!((isBusiness ? form.companyName : form.name) && form.email && form.password.length >= 8 && form.terms);

  async function enterOtpStep() {
    setBusy(true);
    setError(null);
    try {
      await requestOtp(form.email);
      setStep("otp");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send verification code");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyOtp() {
    setBusy(true);
    setOtpError(null);
    try {
      const res = await verifyOtp(form.email, otpDigits.join(""));
      setEmailVerifiedToken(res.email_verified_token);
      setStep("purpose");
    } catch {
      setOtpError("That code didn't match. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setOtpDigits(["", "", "", "", "", ""]);
    setOtpError(null);
    await requestOtp(form.email).catch(() => undefined);
  }

  async function handleFinish() {
    if (!emailVerifiedToken) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signup({
        email: form.email,
        email_verified_token: emailVerifiedToken,
        password: form.password,
        account_type: form.accountType,
        name: isBusiness ? undefined : form.name,
        company_name: isBusiness ? form.companyName : undefined,
        experience_level: isBusiness ? undefined : form.experienceLevel,
        use_case: isBusiness ? undefined : form.useCase || undefined,
        purposes: form.purposes,
        bio: form.bio || undefined,
        connects: form.connects,
      });
      setSession(res.access_token, res.user);
      setStep("confirmation");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account");
    } finally {
      setBusy(false);
    }
  }

  const firstName = (form.name || form.companyName || "there").trim().split(" ")[0];

  return (
    <div className="flex flex-col items-center w-full">
      <ProgressBar step={step} accountType={form.accountType} />

      {step === "role" && (
        <div className={cardClass}>
          <h1 className="font-display font-bold text-[28px] leading-tight text-foreground mb-2">Create your account</h1>
          <p className="text-foreground-muted text-[14.5px] leading-relaxed mb-7">First, tell us what brings you to Tracent.</p>

          <div className="flex flex-col gap-3 mb-2">
            {(["individual", "business"] as const).map((type) => {
              const active = form.accountType === type;
              return (
                <div
                  key={type}
                  onClick={() => setForm((f) => ({ ...f, accountType: type }))}
                  className="cursor-pointer flex items-center gap-4 p-4.5 rounded"
                  style={{
                    background: active ? "rgba(34,211,238,.1)" : "rgba(244,247,243,.03)",
                    border: `1px solid ${active ? "rgba(34,211,238,.35)" : "rgba(244,247,243,.1)"}`,
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold text-[15.5px] text-foreground mb-0.5">
                      {type === "individual" ? "Individual use" : "Business"}
                    </div>
                    <div className="text-[12.5px] leading-tight text-foreground-muted">
                      {type === "individual"
                        ? "Browse the marketplace and deploy agents for yourself or a personal project"
                        : "List agents under a company profile, verify your ticker and reach buyers at scale"}
                    </div>
                  </div>
                  <div
                    className="w-[18px] h-[18px] rounded-full flex-none"
                    style={{
                      border: `2px solid ${active ? "#22D3EE" : "rgba(244,247,243,.3)"}`,
                      background: active ? "#22D3EE" : "transparent",
                    }}
                  />
                </div>
              );
            })}
          </div>

          <ContinueButton onClick={() => setStep("details")}>Continue</ContinueButton>
          <div className="mt-4 text-center text-sm text-foreground-muted">
            Already have an account?{" "}
            <span onClick={() => setStep("login")} className="text-cyan font-semibold cursor-pointer">
              Sign in
            </span>
          </div>
        </div>
      )}

      {step === "login" && (
        <div className={cardClass}>
          <h1 className="font-display font-bold text-2xl leading-tight text-foreground mb-1.5">Welcome back</h1>
          <p className="text-foreground-muted text-sm leading-relaxed mb-6">Sign in to your Tracent account.</p>

          <div className="flex flex-col gap-3.5 mb-5">
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={inputClass}
                placeholder="ada@company.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                className={inputClass}
                placeholder="Your password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
              />
            </div>
          </div>

          <div className="text-right mb-3 -mt-1">
            <Link href="/reset-password" className="text-cyan font-semibold text-[12.5px]">
              Forgot password?
            </Link>
          </div>

          {error && <p className="text-error text-[12.5px] font-semibold mb-3">{error}</p>}

          <ContinueButton disabled={busy || !loginEmail || !loginPassword} onClick={handleLogin}>
            {busy ? "Signing in…" : "Sign in"}
          </ContinueButton>
          <div className="mt-4 text-center text-sm text-foreground-muted">
            New to Tracent?{" "}
            <span onClick={() => { setError(null); setStep("role"); }} className="text-cyan font-semibold cursor-pointer">
              Create an account
            </span>
          </div>
        </div>
      )}

      {step === "details" && (
        <div className={cardClass}>
          <BackLink onClick={() => setStep("role")} />
          <h1 className="font-display font-bold text-2xl leading-tight text-foreground mb-1.5">
            {isBusiness ? "Set up your business account" : "Create your account"}
          </h1>
          <p className="text-foreground-muted text-sm leading-relaxed mb-6">
            {isBusiness ? "This becomes your public company profile on Tracent." : "Just a few details and you're in."}
          </p>

          <div className="flex flex-col gap-3.5 mb-4.5">
            {isBusiness ? (
              <div>
                <label className={labelClass}>Company name</label>
                <input
                  className={inputClass}
                  placeholder="Meridian Labs"
                  value={form.companyName}
                  onChange={(e) => setForm((f) => ({ ...f, companyName: e.target.value }))}
                />
              </div>
            ) : (
              <div>
                <label className={labelClass}>Full name</label>
                <input
                  className={inputClass}
                  placeholder="Ada Lovelace"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
            )}
            <div>
              <label className={labelClass}>Email</label>
              <input
                type="email"
                className={inputClass}
                placeholder="ada@company.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className={labelClass}>Password</label>
              <input
                type="password"
                className={inputClass}
                placeholder="At least 8 characters"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              />
            </div>
          </div>

          <div className="flex items-start gap-2.5 mb-6">
            <div
              onClick={() => setForm((f) => ({ ...f, terms: !f.terms }))}
              className="cursor-pointer flex-none w-[17px] h-[17px] mt-0.5 rounded-sm flex items-center justify-center"
              style={{
                border: `1px solid ${form.terms ? "#35C0B0" : "rgba(244,247,243,.3)"}`,
                background: form.terms ? "#35C0B0" : "transparent",
              }}
            >
              {form.terms && <span className="text-background text-[11px] font-bold leading-none">✓</span>}
            </div>
            <span className="text-[12.5px] leading-relaxed text-foreground-muted">
              I agree to the Terms of Service and Privacy Policy
            </span>
          </div>

          {error && <p className="text-error text-[12.5px] font-semibold mb-3">{error}</p>}

          <ContinueButton
            disabled={!canSubmitDetails || busy}
            onClick={() => (isBusiness ? enterOtpStep() : setStep("experience"))}
          >
            {busy ? "Please wait…" : "Continue"}
          </ContinueButton>
        </div>
      )}

      {step === "experience" && (
        <div className={cardClass}>
          <BackLink onClick={() => setStep("details")} />
          <h1 className="font-display font-bold text-[26px] leading-tight text-foreground mb-1.5">
            What&apos;s your AI experience level?
          </h1>
          <p className="text-foreground-muted text-sm leading-relaxed mb-6">
            This helps us tailor recommendations and onboarding to you.
          </p>

          <div className="flex flex-col gap-2.5 mb-6">
            {EXPERIENCE_LEVELS.map((opt) => {
              const active = form.experienceLevel === opt.level;
              return (
                <div
                  key={opt.level}
                  onClick={() => setForm((f) => ({ ...f, experienceLevel: opt.level }))}
                  className="cursor-pointer px-4.5 py-4 rounded font-semibold text-[14.5px]"
                  style={{
                    background: active ? "rgba(34,211,238,.14)" : "rgba(244,247,243,.05)",
                    border: `1px solid ${active ? "rgba(34,211,238,.5)" : "rgba(244,247,243,.14)"}`,
                    color: active ? "#22D3EE" : "#F4F7F3",
                  }}
                >
                  <div className="mb-0.5">{opt.level}</div>
                  <div className="font-normal text-[12.5px] leading-tight text-foreground-faint">{opt.desc}</div>
                </div>
              );
            })}
          </div>

          <ContinueButton onClick={() => setStep("usecase")}>Continue</ContinueButton>
        </div>
      )}

      {step === "usecase" && (
        <div className={cardClass}>
          <BackLink onClick={() => setStep("experience")} />
          <h1 className="font-display font-bold text-[26px] leading-tight text-foreground mb-1.5">
            What&apos;s your best use case for an AI tool?
          </h1>
          <p className="text-foreground-muted text-sm leading-relaxed mb-6">
            In 2-3 sentences, tell us what you&apos;d want an agent to help you with.
          </p>

          <textarea
            className={`${inputClass} min-h-[110px] resize-y mb-6`}
            placeholder="e.g. I'd like an agent that can triage my inbox and draft replies..."
            value={form.useCase}
            onChange={(e) => setForm((f) => ({ ...f, useCase: e.target.value }))}
          />

          {error && <p className="text-error text-[12.5px] font-semibold mb-3">{error}</p>}

          <ContinueButton disabled={busy} onClick={enterOtpStep}>
            {busy ? "Please wait…" : "Continue"}
          </ContinueButton>
          <div
            onClick={busy ? undefined : enterOtpStep}
            className="mt-3 text-center font-semibold text-[12.5px] text-foreground-faint cursor-pointer"
          >
            Skip for now
          </div>
        </div>
      )}

      {step === "otp" && (
        <div className={`${cardClass} text-center`}>
          <div className="inline-flex items-center gap-2 px-3.5 py-[7px] rounded-sm bg-[rgba(53,192,176,.1)] border border-[rgba(53,192,176,.3)] font-semibold text-xs text-cyan mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan" />
            Two-step verification
          </div>
          <h1 className="font-display font-bold text-2xl leading-tight text-foreground mb-2">Verify it&apos;s you</h1>
          <p className="text-foreground-muted text-sm leading-relaxed mb-6">
            We sent a 6-digit code to {form.email}. Enter it below to secure your account.
          </p>

          <div className="flex gap-2.5 justify-center mb-5.5">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                maxLength={1}
                value={digit}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, "").slice(-1);
                  setOtpDigits((d) => d.map((existing, idx) => (idx === i ? val : existing)));
                  setOtpError(null);
                  if (val && e.target.nextElementSibling instanceof HTMLInputElement) {
                    e.target.nextElementSibling.focus();
                  }
                }}
                className="w-11 h-[52px] text-center rounded bg-[rgba(244,247,243,.06)] border border-border-strong text-foreground font-display font-bold text-xl focus:outline-none focus:border-cyan"
              />
            ))}
          </div>

          {otpError && <p className="text-error text-[12.5px] font-semibold mb-4.5">{otpError}</p>}

          <ContinueButton disabled={busy || otpDigits.some((d) => !d)} onClick={handleVerifyOtp}>
            {busy ? "Verifying…" : "Verify & continue"}
          </ContinueButton>

          <div className="mt-4 text-sm text-foreground-muted">
            Didn&apos;t get it?{" "}
            <span onClick={handleResend} className="text-cyan font-semibold cursor-pointer">
              Resend code
            </span>
          </div>
        </div>
      )}

      {step === "purpose" && (
        <div className={cardClass}>
          <h1 className="font-display font-bold text-2xl leading-tight text-foreground mb-1.5">
            What will you use Tracent for?
          </h1>
          <p className="text-foreground-muted text-sm leading-relaxed mb-5">
            Pick the areas you care about. This shapes what we show you first. Choose as many as apply.
          </p>

          <div className="flex flex-wrap gap-2 mb-5">
            {PURPOSES.map((p) => {
              const active = form.purposes.includes(p.id);
              return (
                <span
                  key={p.id}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      purposes: active ? f.purposes.filter((id) => id !== p.id) : [...f.purposes, p.id],
                    }))
                  }
                  className="cursor-pointer px-3.5 py-2 rounded-sm font-semibold text-[12.5px]"
                  style={{
                    background: active ? "rgba(53,192,176,.14)" : "rgba(244,247,243,.05)",
                    border: `1px solid ${active ? "rgba(53,192,176,.4)" : "rgba(244,247,243,.14)"}`,
                    color: active ? "#35C0B0" : "rgba(244,247,243,.7)",
                  }}
                >
                  {p.label}
                </span>
              );
            })}
          </div>

          {form.purposes.includes("other") && (
            <input
              className={`${inputClass} mb-3`}
              placeholder="Tell us what else you're working on"
              value={form.otherPurpose}
              onChange={(e) => setForm((f) => ({ ...f, otherPurpose: e.target.value }))}
            />
          )}

          <ContinueButton disabled={form.purposes.length === 0} onClick={() => setStep("profile")}>
            Continue
          </ContinueButton>
        </div>
      )}

      {step === "profile" && (
        <div className="w-full max-w-[860px] p-9 rounded bg-surface border border-border-strong glass-card box-border">
          <div className="flex flex-wrap gap-4 items-end justify-between mb-5 pb-5 border-b border-border">
            <div>
              <h1 className="font-display font-bold text-[28px] leading-tight text-foreground mb-1.5">
                Set up your profile
              </h1>
              <p className="text-foreground-muted text-[14.5px] leading-relaxed max-w-[480px]">
                {isBusiness
                  ? "This is what buyers see on your company profile."
                  : "A short bio helps other builders find and follow you."}
              </p>
            </div>
            <div onClick={handleFinish} className="font-semibold text-[13px] text-foreground-faint cursor-pointer whitespace-nowrap pb-1.5">
              Skip for now
            </div>
          </div>

          <div className="flex flex-wrap gap-10 items-start">
            <div className="flex-1 min-w-[220px] max-w-[260px] flex flex-col gap-4">
              <div className="w-[120px] h-[120px] rounded bg-gradient-to-br from-blue to-blue-to flex items-center justify-center font-display font-bold text-4xl text-white">
                {(isBusiness ? form.companyName : form.name).trim().slice(0, 2).toUpperCase() || "TC"}
              </div>
              <div>
                <div className="font-display font-bold text-[17px] text-foreground mb-0.5">
                  {isBusiness ? form.companyName || "Your company" : form.name || "Your name"}
                </div>
                <div className="font-medium text-[12.5px] font-mono text-foreground-faint">{form.email}</div>
              </div>

              <div className="mt-2">
                <div className="font-bold text-[11px] text-foreground-faint uppercase tracking-wide mb-2.5">
                  Connected accounts
                </div>
                <div className="flex flex-col gap-1.5">
                  {(["github", "x", "linkedin", "website", "huggingface", "other"] as const).map((key) => (
                    <input
                      key={key}
                      value={form.connects[key]}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, connects: { ...f.connects, [key]: e.target.value } }))
                      }
                      placeholder={key === "github" ? "GitHub" : key === "x" ? "X (Twitter)" : key[0].toUpperCase() + key.slice(1)}
                      className="w-full box-border px-2.5 py-1.5 rounded-sm bg-[rgba(244,247,243,.05)] border border-transparent focus:border-border-strong text-foreground text-xs focus:outline-none"
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-[2] min-w-[300px] flex flex-col gap-6">
              <div>
                <label className="block mb-2 font-semibold text-[13px] text-foreground-muted">
                  {isBusiness ? "Company bio" : "Bio"}
                </label>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  placeholder={isBusiness ? "What does your company build?" : "What are you working on?"}
                  value={form.bio}
                  onChange={(e) => setForm((f) => ({ ...f, bio: e.target.value }))}
                />
              </div>

              {error && <p className="text-error text-[12.5px] font-semibold">{error}</p>}

              <div
                onClick={busy ? undefined : handleFinish}
                className="self-start px-8 py-[15px] rounded font-semibold text-[15px] cursor-pointer text-white"
                style={{ background: "linear-gradient(135deg,#072AC8,#2f4fe0)", boxShadow: "0 10px 30px rgba(7,42,200,.45)" }}
              >
                {busy ? "Creating account…" : "Finish setup"}
              </div>
            </div>
          </div>
        </div>
      )}

      {step === "confirmation" && (
        <div className={`${cardClass} text-center py-12`}>
          <div className="w-16 h-16 mx-auto mb-6 flex items-center justify-center rounded-full border-2 border-cyan text-cyan text-3xl">
            ✓
          </div>
          <h1 className="font-display font-bold text-2xl text-foreground mb-2.5">You&apos;re all set, {firstName}</h1>
          <p className="text-foreground-muted text-[14.5px] leading-relaxed max-w-[360px] mx-auto mb-7">
            {isBusiness
              ? "Your company profile is ready. Add your first agent listing to start building your following."
              : "Your account is ready. Head to the marketplace to find your first agent."}
          </p>
          <div
            onClick={() => router.push("/marketplace")}
            className="inline-flex px-7.5 py-[15px] rounded bg-foreground text-background font-semibold text-[14.5px] cursor-pointer"
          >
            {isBusiness ? "Go to your profile" : "Browse the marketplace"}
          </div>
        </div>
      )}
    </div>
  );
}
