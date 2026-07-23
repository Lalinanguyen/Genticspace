import type { Metadata } from "next";
import { Instrument_Serif, Raleway } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const raleway = Raleway({
  variable: "--font-raleway",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Genticspace: AI agent marketplace",
  description: "Find an AI agent for the job, in plain English. Search, compare and deploy AI agents by industry, license and deployment type.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${instrumentSerif.variable} ${raleway.variable}`}>
      <body className="min-h-screen bg-background text-foreground font-body antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
