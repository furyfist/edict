import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { seed } from "@/lib/db/seed";

export const dynamic = "force-dynamic";

/**
 * Reset to a clean state.
 *
 * Between demo runs the database needs to go back to exactly where it started,
 * in seconds, without anyone touching a terminal. The seed is deterministic —
 * fixed ids, a fixed epoch, no randomness — so "clean" means byte-identical to
 * the last clean state rather than approximately similar.
 *
 * This is destructive by design and it is the one endpoint that is. It is
 * gated behind the demo mode flag so that a deployment intended to hold real
 * records cannot have them removed by a POST.
 */
export async function POST(): Promise<NextResponse> {
  if (process.env.DEMO_MODE === "off") {
    return NextResponse.json(
      { error: "Reseeding is disabled on this deployment." },
      { status: 403 },
    );
  }

  // A duration, not a clock read. The demo clock governs system time; this
  // measures how long the reset took so an operator between runs knows whether
  // to wait. performance.now() is monotonic and is not a wall-clock value.
  const startedAt = performance.now();

  try {
    await seed();
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        note: "The database was not reset. It may be in a partial state — run the seed from a terminal.",
      },
      { status: 500 },
    );
  }

  const [vendors, renewals, mandates, entries] = await Promise.all([
    prisma.vendor.count(),
    prisma.renewal.count(),
    prisma.mandate.count(),
    prisma.ledgerEntry.count(),
  ]);

  return NextResponse.json({
    ok: true,
    elapsedMs: Math.round(performance.now() - startedAt),
    vendors,
    renewals,
    mandates,
    ledgerEntries: entries,
    note: `Reset to a clean state: ${vendors} vendors, ${renewals} renewals, ${mandates} mandates, an empty ledger.`,
  });
}
