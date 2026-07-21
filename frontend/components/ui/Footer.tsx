import Link from "next/link";

export function Footer() {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3 border-t border-border px-[5%] py-[22px] box-border">
      <span className="font-medium text-[12.5px] text-foreground-faint">© 2026 Genticspace</span>
      <div className="flex gap-5 flex-wrap">
        <Link href="/marketplace" className="font-medium text-[12.5px] text-foreground-muted hover:text-foreground">
          Marketplace
        </Link>
        <Link href="/contact" className="font-medium text-[12.5px] text-foreground-muted hover:text-foreground">
          Contact
        </Link>
      </div>
    </div>
  );
}
