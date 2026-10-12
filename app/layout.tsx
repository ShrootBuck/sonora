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
  title: "Sonora — Posts, carousels & picture stories",
  description:
    "Format a photo dump, build a seamless carousel, or bring your photos to life with music. Create everything locally in your browser.",
  applicationName: "Sonora",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Sonora",
    description:
      "Your camera roll, ready to post. Carousels, collages, and 60 FPS stories.",
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
