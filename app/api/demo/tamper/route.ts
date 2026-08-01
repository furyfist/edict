import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/**
 * DEMO BEAT — rewrite history, and get caught.
 *
 * ---------------------------------------------------------------------------
 * THIS DELIBERATELY DOES NOT GO THROUGH lib/ledger.
 *
 * `lib/ledger` exports exactly one mutating function and it is `appendEntry`.
 * There is no update path and no delete path, and that has not changed — which
 * is precisely the point being demonstrated here.
 *
 * This route reaches past the application and writes to the table directly. It
 * simulates the only actor who can actually alter this record: someone holding
 * database credentials. Not a feature. An attacker, played on stage.
 *
 * Say it out loud before clicking, the same way the engine bypass is announced:
 *
 *   "Our application cannot edit this record. I am going in through the
 *    database, which is the only way it can be done at all."
 *
 * Then re-export and re-run the verifier. The altered entry fails its
 * signature, and every entry after it fails its chain link.
 * ---------------------------------------------------------------------------
 *
 * `restore` puts the original value back, so the beat is repeatable without an
 * 80-second reseed. Both directions are equally illegitimate and equally
 * detectable — restoring is just another database write.
 */

type Mode = "tamper" | "restore";

/** What we overwrite. Chosen because a judge can see it change on screen. */
const TAMPERED_AMOUNT = 4_800_000;

export async function POST(request: Request) {
  let body: { entryId?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.entryId !== "string") {
    return NextResponse.json({ error: "entryId is required" }, { status: 400 });
  }

  const mode: Mode = body.mode === "restore" ? "restore" : "tamper";

  const entry = await db.ledgerEntry.findUnique({
    where: { id: body.entryId },
    select: {
      id: true,
      vendorName: true,
      amountCents: true,
      financialImpact: true,
      receiptDigest: true,
    },
  });

  if (!entry) {
    return NextResponse.json({ error: "no such entry" }, { status: 404 });
  }

  if (!entry.receiptDigest) {
    return NextResponse.json(
      {
        error:
          "this entry has no receipt, so altering it proves nothing. Pick an attested entry.",
      },
      { status: 409 },
    );
  }

  // The original lives in the entry's own frozen financial impact, which the
  // receipt covers — so we can always put back exactly what was signed.
  const impact = entry.financialImpact as { chargedCents?: number } | null;
  const original = impact?.chargedCents;

  if (mode === "restore" && typeof original !== "number") {
    return NextResponse.json(
      { error: "cannot recover the original amount for this entry" },
      { status: 409 },
    );
  }

  const next = mode === "tamper" ? TAMPERED_AMOUNT : (original as number);

  await db.ledgerEntry.update({
    where: { id: entry.id },
    data: { amountCents: next },
  });

  return NextResponse.json({
    mode,
    entryId: entry.id,
    vendorName: entry.vendorName,
    amountCentsBefore: entry.amountCents,
    amountCentsAfter: next,
    note:
      mode === "tamper"
        ? "Row rewritten at the database level. Re-export and verify — this entry now fails its signature, and everything after it fails its chain link."
        : "Original value restored. The chain verifies again.",
  });
}
