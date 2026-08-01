import { describe, expect, it } from "vitest";
import { reconcile, type LedgerCharge } from "./core";
import { cents } from "../contracts/money";
import type { ChargeRecord } from "../prava";

/**
 * One test per accusation, because each is a different accusation.
 *
 * The test that matters most is the orphan charge: it is the only one that
 * describes money moving without a record, and it is the claim the whole
 * milestone exists to make checkable.
 */

function entry(overrides: Partial<LedgerCharge> = {}): LedgerCharge {
  return {
    entryId: "entry-1",
    vendorName: "Figma",
    mandateId: "mandate-figma",
    chargeId: "charge-1",
    amountCents: cents(18000),
    reference: "renewal-figma-2026-03:2026-03-01",
    ...overrides,
  };
}

function charge(overrides: Partial<ChargeRecord> = {}): ChargeRecord {
  return {
    chargeId: "charge-1",
    mandateId: "mandate-figma",
    amountCents: cents(18000),
    currency: "USD",
    status: "succeeded",
    createdAt: "2026-03-01T09:00:00.000Z",
    reference: "renewal-figma-2026-03:2026-03-01",
    ...overrides,
  };
}

function run(entries: LedgerCharge[], charges: ChargeRecord[]) {
  return reconcile({ mandateId: "mandate-figma", entries, charges });
}

describe("two-sided reconciliation", () => {
  it("balances when both books agree", () => {
    const result = run([entry()], [charge()]);
    expect(result.discrepancies).toEqual([]);
    expect(result.matched).toBe(1);
  });

  it("ORPHAN_CHARGE — money moved and we have no record", () => {
    // The omission attack, seen from the books. Our ledger is intact, signed,
    // hash-linked, and silent about a charge that happened.
    const result = run([], [charge({ chargeId: "charge-stolen" })]);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].kind).toBe("ORPHAN_CHARGE");
    // Named, not counted. "One discrepancy" is useless on stage; a charge id is
    // something a judge can go and look up in Prava's dashboard.
    expect(result.discrepancies[0].chargeId).toBe("charge-stolen");
    expect(result.discrepancies[0].networkCents).toBe(18000);
    expect(result.discrepancies[0].ledgerCents).toBeNull();
  });

  it("ORPHAN_ENTRY — we claim money moved and the network disagrees", () => {
    const result = run([entry({ chargeId: "charge-ghost" })], []);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].kind).toBe("ORPHAN_ENTRY");
    expect(result.discrepancies[0].entryId).toBe("entry-1");
    expect(result.discrepancies[0].detail).toContain("no record of");
  });

  it("AMOUNT_MISMATCH — both books have it and disagree about how much", () => {
    const result = run([entry()], [charge({ amountCents: cents(48000) })]);

    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].kind).toBe("AMOUNT_MISMATCH");
    expect(result.discrepancies[0].ledgerCents).toBe(18000);
    expect(result.discrepancies[0].networkCents).toBe(48000);
    // Not also reported as an orphan on either side.
    expect(result.matched).toBe(0);
  });

  it("matches by reference when the entry never received a charge id", () => {
    // A crash between charging and recording the id leaves this shape. Calling
    // it an orphan would be the system making a false accusation about itself.
    const result = run([entry({ chargeId: null })], [charge()]);

    expect(result.discrepancies).toEqual([]);
    expect(result.matched).toBe(1);
  });

  it("reports an entry with no charge id and no matching reference precisely", () => {
    const result = run(
      [entry({ chargeId: null, reference: "nothing-matches-this" })],
      [charge()],
    );

    const kinds = result.discrepancies.map((d) => d.kind);
    // Both directions fire, and correctly: our entry matches nothing, and the
    // network's charge is unclaimed. Two facts, two rows.
    expect(kinds).toContain("ORPHAN_ENTRY");
    expect(kinds).toContain("ORPHAN_CHARGE");
    expect(result.discrepancies[0].detail).toContain("carries no charge id");
  });

  it("never lets one charge satisfy two entries", () => {
    // Otherwise a duplicated ledger entry would hide behind a single real
    // charge, and double-recording would reconcile clean.
    const result = run(
      [entry({ entryId: "entry-1" }), entry({ entryId: "entry-2" })],
      [charge()],
    );

    expect(result.matched).toBe(1);
    expect(result.discrepancies).toHaveLength(1);
    expect(result.discrepancies[0].kind).toBe("ORPHAN_ENTRY");
    expect(result.discrepancies[0].entryId).toBe("entry-2");
  });

  it("counts both books, so an empty reconciliation cannot look like a clean one", () => {
    const result = run([], []);
    expect(result).toMatchObject({
      entriesChecked: 0,
      chargesChecked: 0,
      matched: 0,
      discrepancies: [],
    });
  });

  it("is pure — the same books reconcile identically every time", () => {
    const entries = [entry(), entry({ entryId: "entry-2", chargeId: "charge-2" })];
    const charges = [charge(), charge({ chargeId: "charge-3", reference: null })];
    expect(JSON.stringify(run(entries, charges))).toBe(
      JSON.stringify(run(entries, charges)),
    );
  });
});
