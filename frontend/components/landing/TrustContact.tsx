import Link from "next/link";

export function TrustContact() {
  return (
    <>
      <div className="px-[5%] pb-[72px] box-border">
        <p className="m-0 max-w-[640px] font-body text-[15px] leading-[1.7] text-foreground-muted">
          Every listing is checked against public agent registries - identity, licensing and deployment claims
          - so you don&apos;t have to take a builder&apos;s word for it.
        </p>
      </div>

      <div className="px-[5%] pb-[72px] box-border">
        <div
          className="relative overflow-hidden rounded p-16 px-[6%] box-border"
          style={{
            background: "linear-gradient(135deg,rgba(53,192,176,.24),rgba(53,192,176,.05))",
            border: "1px solid rgba(28,38,33,.12)",
            boxShadow: "0 3px 12px rgba(28,38,33,.07)",
          }}
        >
          <div className="relative z-[1] flex items-center justify-between gap-8 flex-wrap">
            <div className="max-w-[520px]">
              <h2 className="m-0 mb-3 font-display font-normal text-4xl leading-[1.1] text-foreground tracking-[-.6px]">
                Interested? <span className="italic" style={{ color: "#178C7E" }}>Let&apos;s talk.</span>
              </h2>
              <p className="m-0 font-body text-[15.5px] leading-[1.65] text-foreground-muted">
                Whether you&apos;re hunting for the right agent or ready to list your own, we&apos;ll help you find
                the shortest path to deployed.
              </p>
            </div>
            <div className="flex flex-col gap-3 flex-none">
              <a
                href="mailto:hello@genticspace.ai"
                className="inline-flex items-center gap-2.5 font-bold text-sm text-background bg-foreground px-[30px] py-[15px] rounded no-underline transition-transform duration-200 hover:scale-[1.04]"
              >
                &#9993; Contact us
              </a>
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-2.5 font-bold text-sm text-foreground px-[30px] py-[15px] rounded no-underline transition-transform duration-200 hover:scale-[1.04]"
                style={{ border: "1px solid rgba(28,38,33,.3)", background: "rgba(238,241,234,.6)" }}
              >
                Browse first &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
