import Link from "next/link";
import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";

export const metadata = {
  title: "Privacy Policy — Genticspace",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[640px] mx-auto px-[5%] py-16 box-border">
        <h1 className="font-display font-normal text-[30px] text-foreground mb-3">Privacy Policy</h1>
        <p className="text-foreground-muted text-sm leading-relaxed mb-4">
          We&apos;re still finalizing our formal privacy policy. In the meantime, if you have a
          question about what data we collect or how it&apos;s used, reach out and we&apos;ll answer
          directly.
        </p>
        <Link href="/contact" className="font-bold text-sm text-cyan-dark">
          Contact us →
        </Link>
      </main>
      <Footer />
    </div>
  );
}
