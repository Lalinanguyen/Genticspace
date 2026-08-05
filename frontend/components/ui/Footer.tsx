import Link from "next/link";

export function Footer() {
  return (
    <div className="border-t border-border px-[5%] py-9 box-border flex items-center justify-between flex-wrap gap-5">
      <div className="flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/bubble-logo.svg" alt="Genticspace" className="w-[26px] h-[26px] object-contain" />
        <span className="font-display font-normal text-lg text-foreground">Genticspace</span>
      </div>
      <span className="font-medium text-[12.5px] text-foreground-faint">© 2026 Genticspace. All rights reserved.</span>
      <div className="flex flex-wrap gap-[22px] font-medium text-[13px] text-foreground-muted">
        <Link href="/marketplace" className="hover:text-foreground">
          Marketplace
        </Link>
        <Link href="/contribute" className="hover:text-foreground">
          Contribute
        </Link>
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
      </div>
    </div>
  );
}
