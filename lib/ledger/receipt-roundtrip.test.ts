import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { db } from "../db/client";
import { generateSigningIdentity, resetSigningIdentityCache } from "../attest";
import { makeEvidenceBundle } from "../fixtures";
import { cents } from "../contracts/money";
import { appendEntry } from "./write";
import { getEntry, verifiedChain } from "./read";

/**
 * THE ROUND TRIP — the test this whole milestone rests on.
 *
 * The writer signs the contract projection it builds in memory. The reader
 * rebuilds that projection from a Postgres row that has been through Prisma's
 * JSON columns, DateTime coercion, and a network hop. If those two shapes
 * disagree by one byte, every signature in the system fails.
 *
 * A unit test cannot catch that, because the divergence lives in the database
 * round trip itself. So this test uses the real database.
 *
 * Skips when DATABASE_URL is unset, so the pure suites still run anywhere.
 */

const LIVE = Boolean(process.env.DATABASE_URL);
const suite = LIVE ? describe : describe.skip;

const TICK_ID = "test-receipt-roundtrip";
let previousKey: string | undefined;

function draftFor(vendorName: string, amount: number) {
  return {
    tickId: TICK_ID,
    clockAt: new Date("2026-03-01T09:00:00.000Z"),
    vendorId: `vendor-${vendorName.toLowerCase()}`,
    vendorName,
    renewalId: `renewal-${vendorName.toLowerCase()}-roundtrip`,
    cycleStart: new Date("2026-03-01T00:00:00.000Z"),
    proposedAction: "RENEW_REDUCED" as const,
    proposedAmountCents: cents(amount),
    decidedBy: { modelId: "test", promptVersion: "v0", stubbed: true },
    authorizedBy: {
      policyVersionId: "policy-test",
      policyVersion: 1,
      ruleId: "rule-test",
      ruleOrdinal: 1,
      sourceFragment: "Auto-renew anything under $500 a month.",
      approverId: null,
      approvalId: null,
      passkeyAt: null,
    },
    evidence: makeEvidenceBundle(),
    alternative: { action: "CANCEL" as const, reason: "Seats remain in use." },
    agentRationale: "Six of twelve seats are dark.",
    counterfactualCents: cents(18000),
  };
}

const completion = {
  outcome: "EXECUTED" as const,
  chargedCents: cents(9000),
  explanation: "Renewed at six seats.",
  counterfactual: "Do nothing and you pay $180.00.",
  executedBy: {
    provider: "prava" as const,
    mandateId: "mandate-test",
    chargeId: "charge-test",
    status: "succeeded",
  },
};

// Generous, because every assertion here is a round trip to a remote Postgres.
// The runbook already measures a full eight-vendor tick at ~90s for the same
// reason: this is network latency, not compute.
suite("receipts survive the database round trip", { timeout: 120_000 }, () => {
  const created: string[] = [];

  beforeAll(async () => {
    previousKey = process.env.RECEIPT_SIGNING_KEY;
    const { privateKeyB64 } = generateSigningIdentity();
    process.env.RECEIPT_SIGNING_KEY = privateKeyB64;
    resetSigningIdentityCache();

    // A fresh chain, so this test does not depend on demo data being present
    // and does not disturb it either.
    await db.ledgerEntry.deleteMany({ where: { tickId: TICK_ID } });
    await db.tick.deleteMany({ where: { id: TICK_ID } });
    await db.tick.create({
      data: {
        id: TICK_ID,
        clockAt: new Date("2026-03-01T09:00:00.000Z"),
        status: "COMPLETED",
      },
    });
  });

  afterAll(async () => {
    await db.ledgerEntry.deleteMany({ where: { tickId: TICK_ID } });
    await db.tick.deleteMany({ where: { id: TICK_ID } });
    if (previousKey === undefined) delete process.env.RECEIPT_SIGNING_KEY;
    else process.env.RECEIPT_SIGNING_KEY = previousKey;
    resetSigningIdentityCache();
    await db.$disconnect();
  });

  it("signs on append and verifies on read", async () => {
    const id = await appendEntry(draftFor("Figma", 9000), completion);
    created.push(id);

    const entry = await getEntry(id);
    expect(entry).not.toBeNull();
    expect(entry!.receipt).not.toBeNull();
    expect(entry!.receipt!.signature).not.toBeNull();

    const mine = (await verifiedChain()).filter((i) => i.entry.tickId === TICK_ID);
    expect(mine).toHaveLength(1);
    expect(mine[0].status).toBe("VALID");
  });

  it("chains consecutive appends", async () => {
    created.push(await appendEntry(draftFor("Linear", 16000), completion));
    created.push(await appendEntry(draftFor("Notion", 480000), completion));

    const mine = (await verifiedChain()).filter((i) => i.entry.tickId === TICK_ID);
    expect(mine).toHaveLength(3);
    expect(mine.every((i) => i.status === "VALID")).toBe(true);

    // Each link points at its predecessor.
    for (let i = 1; i < mine.length; i += 1) {
      expect(mine[i].entry.receipt!.prevDigest).toBe(
        mine[i - 1].entry.receipt!.digest,
      );
    }
  });

  it("detects a tampered field after the fact", async () => {
    const target = created[0];
    const before = await db.ledgerEntry.findUniqueOrThrow({
      where: { id: target },
      select: { amountCents: true },
    });

    // Raw update — deliberately not through lib/ledger, which has no update
    // path. This is what a database-level attacker can do.
    await db.ledgerEntry.update({
      where: { id: target },
      data: { amountCents: 4800000 },
    });

    const tampered = (await verifiedChain()).find((i) => i.entry.id === target);
    expect(tampered!.status).toBe("INVALID");

    await db.ledgerEntry.update({
      where: { id: target },
      data: { amountCents: before.amountCents },
    });

    const restored = (await verifiedChain()).find((i) => i.entry.id === target);
    expect(restored!.status).toBe("VALID");
  });

  it("detects a removed entry as a broken link downstream", async () => {
    const middle = created[1];
    const row = await db.ledgerEntry.findUniqueOrThrow({ where: { id: middle } });

    await db.ledgerEntry.delete({ where: { id: middle } });

    const after = (await verifiedChain()).filter((i) => i.entry.tickId === TICK_ID);
    expect(after.some((i) => i.status === "BROKEN_LINK")).toBe(true);

    // Put it back so the remaining assertions see a whole chain. Cast because
    // a row read back has `JsonValue | null` where create wants Prisma's null
    // sentinel; this is test-only restore code, not a write path.
    await db.ledgerEntry.create({
      data: row as unknown as Prisma.LedgerEntryUncheckedCreateInput,
    });

    const healed = (await verifiedChain()).filter((i) => i.entry.tickId === TICK_ID);
    expect(healed.every((i) => i.status === "VALID")).toBe(true);
  });

  it("writes the entry anyway when no signing key is configured", async () => {
    const key = process.env.RECEIPT_SIGNING_KEY;
    delete process.env.RECEIPT_SIGNING_KEY;
    resetSigningIdentityCache();

    try {
      const id = await appendEntry(draftFor("Loom", 22500), completion);
      created.push(id);

      const entry = await getEntry(id);
      expect(entry).not.toBeNull();
      // The record survives. Only the attestation is missing.
      expect(entry!.receipt).not.toBeNull();
      expect(entry!.receipt!.signature).toBeNull();
      expect(entry!.receipt!.digest).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      process.env.RECEIPT_SIGNING_KEY = key;
      resetSigningIdentityCache();
    }
  });
});
