import Link from "next/link";
import { Footer } from "@/components/ui/Footer";
import { Wizard } from "@/components/create-account/Wizard";

export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const initialStep = params.mode === "login" ? "login" : "role";

  return (
    <div className="flex flex-col min-h-screen">
      <div className="sticky top-0 z-20 w-full box-border flex flex-wrap gap-4 items-center justify-between px-[5%] py-[22px] bg-[rgba(0,23,31,.55)] backdrop-blur-[22px] border-b border-border">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] rounded bg-gradient-to-br from-blue to-cyan shadow-[0_0_22px_rgba(7,42,200,.55)]" />
          <span className="font-display font-bold text-lg text-foreground tracking-tight">Genticspace</span>
        </Link>
        <div className="flex gap-3 items-center flex-none">
          <span className="text-[13px] text-foreground-muted whitespace-nowrap">Already have an account?</span>
          <Link href="/create-account?mode=login" className="font-semibold text-sm text-foreground whitespace-nowrap">
            Sign in
          </Link>
        </div>
      </div>

      <main className="relative flex-1 flex items-center justify-center px-[5%] py-14 overflow-hidden box-border">
        <div
          className="absolute -top-36 left-[8%] w-[420px] h-[420px] glow-blob"
          style={{ background: "radial-gradient(circle, rgba(7,42,200,.5), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 right-[6%] w-[460px] h-[460px] glow-blob"
          style={{ background: "radial-gradient(circle, rgba(53,192,176,.35), transparent 70%)", animationDelay: "1s" }}
        />
        <div className="relative w-full flex justify-center">
          <Wizard initialStep={initialStep} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
