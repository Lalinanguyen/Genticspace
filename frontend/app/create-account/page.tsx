import { Nav } from "@/components/ui/Nav";
import { Footer } from "@/components/ui/Footer";
import { Wizard } from "@/components/create-account/Wizard";

export default async function CreateAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const initialStep = params.mode === "login" ? "login" : "role";

  return (
    <div className="flex flex-col min-h-screen">
      <Nav />

      <main className="relative flex-1 flex items-center justify-center px-[5%] py-14 overflow-hidden box-border">
        <div
          className="absolute -top-36 left-[8%] w-[420px] h-[420px] glow-blob"
          style={{ background: "radial-gradient(circle, rgba(7,42,200,.5), transparent 70%)" }}
        />
        <div
          className="absolute -bottom-40 right-[6%] w-[460px] h-[460px] glow-blob"
          style={{ background: "radial-gradient(circle, rgba(53,192,176,.35), transparent 70%)", animationDelay: "1s" }}
        />
        <div className="relative w-full flex justify-center">
          <Wizard initialStep={initialStep} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
