import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";

export default function PrivacyPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[720px] mx-auto px-[5%] py-16 box-border">
        <div className="mb-8 px-4 py-3 rounded bg-[rgba(232,163,61,.1)] border border-[rgba(232,163,61,.35)]">
          <p className="m-0 text-[13px] leading-relaxed text-foreground-muted">
            <strong className="text-foreground">Placeholder text.</strong> This page has not been reviewed by a
            lawyer and is not the real Privacy Policy. It exists so signup and footer links have something real
            to point at while the actual legal copy is being written.
          </p>
        </div>

        <h1 className="font-display font-bold text-[30px] text-foreground mb-6">Privacy Policy</h1>

        <div className="flex flex-col gap-6 text-sm leading-relaxed text-foreground-muted">
          <p>
            We collect the account information you give us (email, name or company name, bio, connected-account
            links) and basic usage data needed to run the platform - things like sandbox run logs, reviews you
            write, and agents you favorite or follow.
          </p>
          <p>
            We don&apos;t sell your personal data. Agent listing data (name, description, GitHub/HuggingFace source
            info, etc.) is public by design, since Genticspace is a public discovery registry.
          </p>
          <p>
            Sandbox Mode runs a listed agent&apos;s own code in an isolated environment when you choose to try it;
            the run's logs are stored against your account so you can view the result.
          </p>
          <p>
            We use your email for account verification, password resets, and optional notifications you can turn
            off in settings. We don&apos;t share it with third parties for marketing.
          </p>
          <p>
            You can request account deletion at any time by contacting us.
          </p>
          <p className="text-foreground-faint">
            Questions about this policy? <a href="/contact" className="text-cyan">Contact us</a>.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
