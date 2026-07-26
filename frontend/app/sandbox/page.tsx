import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { SandboxTrialCockpit } from "@/components/agent/SandboxTrialCockpit";

export const metadata = {
  title: "Sandbox trial — Genticspace",
  description: "See what running an agent in a sandbox trial looks like before you install it.",
};

export default function SandboxPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <Nav />
      <main className="flex-1 w-full max-w-[1440px] mx-auto box-border px-[5%]">
        <SandboxTrialCockpit />
      </main>
      <Footer />
    </div>
  );
}
