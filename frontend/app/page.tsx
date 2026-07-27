import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { Hero } from "@/components/landing/Hero";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { SandboxFeature } from "@/components/landing/SandboxFeature";
import { CapabilityShowcase } from "@/components/landing/CapabilityShowcase";

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto bg-background-page box-border">
        <Hero />
        <HowItWorks />
        <SandboxFeature />
        <CapabilityShowcase />
      </main>
      <Footer />
    </div>
  );
}
