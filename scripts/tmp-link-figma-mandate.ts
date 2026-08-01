/**
 * One-off: point the Figma mandate mirror at the REAL Prava mandate created
 * through the passkey ceremony, replacing the placeholder seed id.
 *
 * Throwaway operational script. Reads the live mandate from Prava rather than
 * hardcoding its fields, so the mirror reflects the source of truth.
 */
import { db } from "../lib/db/client";
import { paymentBoundary } from "../lib/prava";

const REAL_MANDATE_ID = "mdt_01KYQGX8JP7KJQTARZXXYPGE40";

async function main() {
  const vendor = await db.vendor.findUnique({ where: { name: "Figma" } });
  if (!vendor) throw new Error("Figma vendor not found — run the seed first.");

  // Pull live state from Prava; never invent what the source of truth says.
  const snapshot = await paymentBoundary().getMandate(REAL_MANDATE_ID);
  if (!snapshot) throw new Error("Could not read mandate from Prava.");

  const updated = await db.mandate.update({
    where: { vendorId: vendor.id },
    data: {
      pravaMandateId: snapshot.mandateId,
      status: snapshot.status,
      capCents: snapshot.capCents,
      remainingCents: snapshot.remainingCents,
      expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
    },
  });

  console.log("linked Figma ->", {
    pravaMandateId: updated.pravaMandateId,
    status: updated.status,
    capCents: updated.capCents,
    remainingCents: updated.remainingCents,
    expiresAt: updated.expiresAt?.toISOString() ?? null,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
