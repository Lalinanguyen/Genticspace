import { Footer } from "@/components/ui/Footer";
import { Nav } from "@/components/ui/Nav";
import { Hero } from "@/components/landing/Hero";
import { SpotlightSection } from "@/components/landing/SpotlightSection";
import { TrustContact } from "@/components/landing/TrustContact";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background-page box-border overflow-x-clip">
        <Hero />
        <SpotlightSection />
        <TrustContact />
      </main>
      <Footer />
    </div>
  );
}
