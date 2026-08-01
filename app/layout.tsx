import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "./components/Nav";
import { SandboxBanner } from "./components/SandboxBanner";

export const metadata: Metadata = {
  title: "edict — Spend Guardian",
  description:
    "An agent that holds a software budget under delegated, network-enforced authority.",
};

/**
 * The permanent chrome, established before any page exists so that no page can
 * ship without the sandbox banner above it.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SandboxBanner />
        <Nav />
        <main style={{ maxWidth: 1120, margin: "0 auto", padding: "28px 20px" }}>
          {children}
        </main>
      </body>
    </html>
  );
}
