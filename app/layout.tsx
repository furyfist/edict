import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "edict — Spend Guardian",
  description:
    "An agent that holds a software budget under delegated, network-enforced authority.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
