/**
 * Throwaway end-to-end check for receipts. Not part of the demo.
 *
 * Appends three entries through the real write path, exports a bundle, tampers
 * with one row at the database level, and exports again — so the verifier can
 * be run against both files.
 */
import { writeFileSync } from "node:fs";
import { db } from "../lib/db/client";
import { appendEntry } from "../lib/ledger";
import { buildBundle } from "../lib/ledger/bundle";
import { makeEvidenceBundle } from "../lib/fixtures";
import { cents } from "../lib/contracts/money";

const TICK_ID = "tmp-receipt-e2e";
const OUT = process.argv[2] ?? "bundle";

function draft(vendor: string, amount: number) {
  return {
    tickId: TICK_ID,
    clockAt: new Date("2026-03-01T09:00:00.000Z"),
    vendorId: `vendor-${vendor.toLowerCase()}`,
    vendorName: vendor,
    renewalId: `renewal-${vendor.toLowerCase()}-e2e`,
    cycleStart: new Date("2026-03-01T00:00:00.000Z"),
    proposedAction: "RENEW_REDUCED" as const,
    proposedAmountCents: cents(amount),
    decidedBy: { modelId: "e2e", promptVersion: "v0", stubbed: true },
    authorizedBy: {
      policyVersionId: "policy-e2e",
      policyVersion: 2,
      ruleId: "rule-e2e",
      ruleOrdinal: 1,
      sourceFragment: "Auto-renew anything under $500 a month if usage is above 60%.",
      approverId: null,
      approvalId: null,
      passkeyAt: null,
    },
    evidence: makeEvidenceBundle(),
    alternative: { action: "CANCEL" as const, reason: "Seats remain in use." },
    agentRationale: "Six of twelve seats are dark.",
    counterfactualCents: cents(amount * 2),
  };
}

const completion = (amount: number) => ({
  outcome: "EXECUTED" as const,
  chargedCents: cents(amount),
  explanation: `Renewed at ${amount} cents.`,
  counterfactual: "Do nothing and you pay double.",
  executedBy: {
    provider: "prava" as const,
    mandateId: "mandate-e2e",
    chargeId: "charge-e2e",
    status: "succeeded",
  },
});

async function main() {
  await db.ledgerEntry.deleteMany({ where: { tickId: TICK_ID } });
  await db.tick.deleteMany({ where: { id: TICK_ID } });
  await db.tick.create({
    data: { id: TICK_ID, clockAt: new Date("2026-03-01T09:00:00.000Z"), status: "COMPLETED" },
  });

  const ids: string[] = [];
  for (const [vendor, amount] of [
    ["Figma", 9000],
    ["Linear", 16000],
    ["Notion", 480000],
  ] as const) {
    ids.push(await appendEntry(draft(vendor, amount), completion(amount)));
  }

  writeFileSync(`${OUT}-clean.json`, JSON.stringify(await buildBundle(), null, 2));
  console.log(`wrote ${OUT}-clean.json`);

  await db.ledgerEntry.update({
    where: { id: ids[1] },
    data: { amountCents: 4800000 },
  });

  writeFileSync(`${OUT}-tampered.json`, JSON.stringify(await buildBundle(), null, 2));
  console.log(`wrote ${OUT}-tampered.json`);

  writeFileSync(
    `${OUT}-single.json`,
    JSON.stringify(await buildBundle({ entryId: ids[0] }), null, 2),
  );
  console.log(`wrote ${OUT}-single.json`);

  await db.ledgerEntry.deleteMany({ where: { tickId: TICK_ID } });
  await db.tick.deleteMany({ where: { id: TICK_ID } });
  console.log("cleaned up");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
