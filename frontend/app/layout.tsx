import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";

const alteHaasGrotesk = localFont({
  variable: "--font-alte-haas-grotesk",
  src: [
    { path: "../public/fonts/AlteHaasGroteskRegular.woff", weight: "400", style: "normal" },
    { path: "../public/fonts/AlteHaasGroteskBold.woff", weight: "700", style: "normal" },
  ],
});

const remingtonedType = localFont({
  variable: "--font-remingtoned-type",
  src: "../public/fonts/RemingtonedType.woff",
  weight: "400",
  style: "normal",
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
    <html lang="en" className={`${alteHaasGrotesk.variable} ${remingtonedType.variable}`}>
      <body className="min-h-screen bg-background text-foreground font-body antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
