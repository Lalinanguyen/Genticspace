const STEP_ORDER = ["role", "details", "experience", "usecase", "otp", "purpose", "profile", "confirmation"] as const;
export type WizardStep = (typeof STEP_ORDER)[number] | "login";

function stepOrderFor(accountType: "individual" | "business"): readonly string[] {
  return accountType === "business" ? STEP_ORDER.filter((s) => s !== "experience" && s !== "usecase") : STEP_ORDER;
}

export function ProgressBar({ step, accountType }: { step: WizardStep; accountType: "individual" | "business" }) {
  if (step === "confirmation" || step === "login") return null;
  const order = stepOrderFor(accountType);
  const current = order.indexOf(step);
  const segments = Math.min(order.length - 1, 6);

  return (
    <div className="flex items-center gap-2 justify-center mb-7">
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          className="w-9 h-[3px] rounded-sm"
          style={{ background: current >= i ? "#35C0B0" : "rgba(28,38,33,.15)" }}
        />
      ))}
    </div>
  );
}
