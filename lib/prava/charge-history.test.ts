import { describe, expect, it } from "vitest";
import { createMockAdapter, inMemoryMandateStore } from "./mock";
import { cents } from "../contracts/money";
import type { MandateSnapshot } from "./types";

/**
 * The second book, at the boundary.
 *
 * The property under test is not "the mock stores things". It is that a charge
 * which SUCCEEDS leaves a trace at the payment boundary that our ledger has no
 * control over — because the whole of M2 rests on being able to find money that
 * moved without a record.
 */

function mandate(overrides: Partial<MandateSnapshot> = {}): MandateSnapshot {
  return {
    mandateId: "mandate-figma",
    status: "ACTIVE",
    capCents: cents(50000),
    remainingCents: cents(50000),
    expiresAt: null,
    ...overrides,
  };
}

function adapterWith(...mandates: MandateSnapshot[]) {
  return createMockAdapter({ store: inMemoryMandateStore(mandates) });
}

describe("charge history at the payment boundary", () => {
  it("records a successful charge in the provider's own book", async () => {
    const adapter = adapterWith(mandate());

    const result = await adapter.charge({
      mandateId: "mandate-figma",
      amountCents: cents(18000),
      currency: "USD",
      idempotencyKey: "renewal-figma-2026-03",
    });

    expect(result.ok).toBe(true);

    const history = await adapter.listCharges("mandate-figma");
    expect(history.ok).toBe(true);
    if (!history.ok) return;

    expect(history.charges).toHaveLength(1);
    expect(history.charges[0]).toMatchObject({
      mandateId: "mandate-figma",
      amountCents: 18000,
      currency: "USD",
      status: "succeeded",
      // Our idempotency key, echoed back. This is the join key that lets
      // reconciliation name an orphan rather than just counting one.
      reference: "renewal-figma-2026-03",
    });
    expect(history.charges[0].chargeId).toBe(
      (result as { chargeId: string }).chargeId,
    );
  });

  it("records nothing when a charge is declined over the ceiling", async () => {
    // A decline is not a charge. If declines appeared in the second book, every
    // over-cap attack in the corpus would look like an orphan and the
    // reconciliation beat would cry wolf on its own defences working.
    const adapter = adapterWith(mandate({ remainingCents: cents(10000) }));

    const result = await adapter.charge({
      mandateId: "mandate-figma",
      amountCents: cents(4800000),
      currency: "USD",
      idempotencyKey: "renewal-figma-2026-03",
    });

    expect(result.ok).toBe(false);
    const history = await adapter.listCharges("mandate-figma");
    expect(history.ok && history.charges).toEqual([]);
  });

  it("scopes history to one mandate", async () => {
    const adapter = adapterWith(mandate(), mandate({ mandateId: "mandate-loom" }));

    await adapter.charge({
      mandateId: "mandate-figma",
      amountCents: cents(18000),
      currency: "USD",
      idempotencyKey: "a",
    });
    await adapter.charge({
      mandateId: "mandate-loom",
      amountCents: cents(22500),
      currency: "USD",
      idempotencyKey: "b",
    });

    const figma = await adapter.listCharges("mandate-figma");
    expect(figma.ok && figma.charges).toHaveLength(1);
    expect(figma.ok && figma.charges[0].amountCents).toBe(18000);
  });

  it("distinguishes an unknown mandate from a mandate with no charges", async () => {
    // The distinction this whole module exists to preserve. "No charges" is a
    // claim about the world; "I cannot see this mandate" is an admission. A
    // reconciler that treats the second as the first would report balanced
    // books for an account it cannot read.
    const adapter = adapterWith(mandate());

    const empty = await adapter.listCharges("mandate-figma");
    expect(empty).toEqual({ ok: true, charges: [] });

    const unknown = await adapter.listCharges("mandate-nope");
    expect(unknown.ok).toBe(false);
    expect(unknown.ok === false && unknown.reason).toBe("MANDATE_NOT_FOUND");
  });

  it("keeps the second book independent of the ledger", async () => {
    // Nothing in this test touches lib/ledger, and that is the point: the
    // adapter wrote a record of money moving without the ledger's involvement
    // or permission. That is exactly the situation the omission beat creates on
    // purpose.
    const adapter = adapterWith(mandate());

    await adapter.charge({
      mandateId: "mandate-figma",
      amountCents: cents(9500),
      currency: "USD",
      idempotencyKey: "suppressed-ledger-write",
    });

    const history = await adapter.listCharges("mandate-figma");
    expect(history.ok && history.charges).toHaveLength(1);
  });
});
