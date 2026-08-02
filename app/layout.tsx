import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

/**
 * Two families, self-hosted at build time — no CDN request at runtime, because
 * the product must work air-gapped and a render-blocking third-party font is
 * the slowest thing a page can wait on.
 *
 * Inter is loaded as a VARIABLE font, which is what makes the 550 weight
 * available. `text-body-strong` is 550 rather than 600: emphasis without the
 * visual shout of semibold, and the reason the sidebar reads as legible rather
 * than heavy.
 *
 * JetBrains Mono carries every machine fact in the product — ids, digests,
 * signatures, mandate references. The font itself is the type signal.
 */
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Edict — delegated authority for an agent that spends",
  description:
    "An agent that holds a software budget under delegated, network-enforced authority. It cannot exceed that authority even when it is wrong, manipulated, or compromised.",
};

/**
 * The root layout carries fonts and nothing else.
 *
 * There are two shells in this product and they do not nest: the marketing
 * entry page at `/` scrolls as an ordinary document, and the console under
 * `/console` is a fixed application frame in which only `<main>` scrolls.
 * Putting chrome here would force one to inherit the other's constraints.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
