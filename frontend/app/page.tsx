import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { Hero } from "@/components/landing/Hero";
import { CategoryRail } from "@/components/landing/CategoryRail";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { NewReleaseSpotlight } from "@/components/landing/NewReleaseSpotlight";
import { TrustBlurb } from "@/components/landing/TrustBlurb";
import { ContactCTA } from "@/components/landing/ContactCTA";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background box-border">
        <Hero />
        <CategoryRail />
        <HowItWorks />
        <NewReleaseSpotlight />
        <TrustBlurb />
        <ContactCTA />
      </main>
      <Footer />
    </div>
  );
}
