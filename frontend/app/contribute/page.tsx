import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { ListingForm } from "@/components/contribute/ListingForm";

export default function ContributePage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background box-border">
        <div className="relative px-[5%] pt-12 pb-2 overflow-hidden box-border">
          <div
            className="absolute -top-40 right-[10%] w-[420px] h-[420px] glow-blob"
            style={{ background: "radial-gradient(circle, rgba(7,42,200,.4), transparent 70%)" }}
          />
          <div className="relative max-w-[720px]">
            <h1 className="font-display font-normal text-4xl leading-tight text-foreground tracking-tight mb-2.5">
              Create a listing
            </h1>
            <p className="text-foreground-muted text-[15px] leading-relaxed">
              Give buyers the plain-English details and the numbers that back them up. You can
              come back and update this listing any time.
            </p>
          </div>
        </div>

        <div className="px-[5%] pt-9 pb-24 box-border">
          <ListingForm />
        </div>
      </main>
      <Footer />
    </div>
  );
}
