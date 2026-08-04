import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";

export default function TermsPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[720px] mx-auto px-[5%] py-16 box-border">
        <div className="mb-8 px-4 py-3 rounded bg-[rgba(232,163,61,.1)] border border-[rgba(232,163,61,.35)]">
          <p className="m-0 text-[13px] leading-relaxed text-foreground-muted">
            <strong className="text-foreground">Placeholder text.</strong> This page has not been reviewed by a
            lawyer and is not the real Terms of Service. It exists so signup and footer links have something real
            to point at while the actual legal copy is being written.
          </p>
        </div>

        <h1 className="font-display font-bold text-[30px] text-foreground mb-6">Terms of Service</h1>

        <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground-muted">
          <p>
            By creating an account or using Genticspace, you agree to use the platform lawfully and not to misuse
            it - including attempting to disrupt the service, scrape it at abusive volume, or use Sandbox
            Mode to run anything other than the agent code you&apos;re trying to evaluate.
          </p>
          <p>
            Agent listings on Genticspace are submitted by their authors or scraped from public sources. We don&apos;t
            guarantee the accuracy, safety, or fitness of any listed agent for any particular purpose. Sandbox Mode
            runs agent code in an isolated environment, but running any third-party code carries inherent risk.
          </p>
          <p>
            Accounts may be suspended for abuse, fraud, or violation of these terms. You&apos;re responsible for
            keeping your account credentials secure.
          </p>
          <p>
            We may update these terms as the product changes. Continued use after an update means you accept the
            revised terms.
          </p>
          <p className="text-foreground-faint">
            Questions about these terms? <a href="/contact" className="text-cyan">Contact us</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
