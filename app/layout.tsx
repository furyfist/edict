import type { Metadata } from "next";
import "./globals.css";
import { SandboxBanner } from "./_components/sandbox-banner";
import { ClockDisplay } from "./_components/clock-display";
import { Nav } from "./_components/nav";
import { HaltedBanner } from "./_components/halted-banner";

export const metadata: Metadata = {
  title: "Spend Guardian",
  description:
    "An agent that holds a software budget under delegated, network-enforced authority.",
};

/**
 * Persistent chrome: the sandbox banner, the seven routes, and the demo clock.
 *
 * The kill switch joins this header in M3. It is reachable from every page for
 * the same reason the banner is undismissable — the safety affordances are not
 * something a user should have to go looking for.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SandboxBanner />
        <HaltedBanner />

        <header className="border-b border-neutral-800/80">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
            <div className="flex items-center gap-6">
              <span className="text-sm font-semibold tracking-tight">
                Spend Guardian
              </span>
              <Nav />
            </div>
            <ClockDisplay />
          </div>
        </header>

        <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
