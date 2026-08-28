import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sonora.party"),
  title: "Sonora — Make dynamic picture stories",
  description:
    "Animate a photo, cut your audio, and export a high-quality 60 FPS story. Everything stays on your device.",
  applicationName: "Sonora",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Sonora",
    description: "Make one photo feel alive at 60 FPS.",
    url: "https://sonora.party",
    siteName: "Sonora",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
