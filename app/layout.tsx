import type { Metadata, Viewport } from "next";
import { Caveat, DM_Sans, Fraunces, Space_Mono } from "next/font/google";
import "./globals.css";

const display = Fraunces({ subsets: ["latin"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const hand = Caveat({ subsets: ["latin"], variable: "--font-hand" });
const mono = Space_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "700"] });

export const metadata: Metadata = {
  title: { default: "6TOC — 6 Months to Change", template: "%s · 6TOC" },
  description: "Pick up to three things. Give them six months. Begin.",
};

export const viewport: Viewport = { themeColor: "#f3efe4", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" data-scroll-behavior="smooth" className={`${display.variable} ${body.variable} ${hand.variable} ${mono.variable}`}><body>{children}</body></html>;
}
