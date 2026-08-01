import { cents } from "../contracts/money";
import type { Cents, Currency, MandateStatus } from "../contracts";
import { db } from "../db/client";
import type { ChargeRecord, MandateSnapshot, MandateStore } from "./types";

/**
 * Mandate store backed by the local mirror.
 *
 * Used by the mock adapter at runtime so the demo behaves against seeded
 * mandates. The real adapter has no equivalent — Prava owns mandate truth and
 * the mirror is only ever a cache refreshed on each tick.
 */

function toSnapshot(row: {
  pravaMandateId: string;
  status: string;
  capCents: number;
  remainingCents: number;
  expiresAt: Date | null;
}): MandateSnapshot {
  return {
    mandateId: row.pravaMandateId,
    status: row.status as MandateStatus,
    capCents: cents(row.capCents),
    remainingCents: cents(row.remainingCents),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

export const dbMandateStore: MandateStore = {
  async get(mandateId) {
    const row = await db.mandate.findUnique({
      where: { pravaMandateId: mandateId },
    });
    return row ? toSnapshot(row) : null;
  },

  async setStatus(mandateId: string, status: MandateStatus) {
    const row = await db.mandate.update({
      where: { pravaMandateId: mandateId },
      data: { status },
    });
    return toSnapshot(row);
  },

  async consume(mandateId: string, amountCents: Cents) {
    const row = await db.mandate.findUnique({
      where: { pravaMandateId: mandateId },
    });
    if (!row) return;

    await db.mandate.update({
      where: { pravaMandateId: mandateId },
      data: { remainingCents: Math.max(0, row.remainingCents - amountCents) },
    });
  },

  /**
   * Persisted, not in-memory, because the reconciliation beat has to survive a
   * server restart. A second book that evaporates when the process does is not
   * a second book.
   *
   * `create`, never `upsert`: the provider's book is append-only too. A repeated
   * charge id is a bug worth hearing about, not a row to overwrite.
   */
  async recordCharge(charge: ChargeRecord) {
    await db.mockCharge.create({
      data: {
        chargeId: charge.chargeId,
        mandateId: charge.mandateId,
        amountCents: charge.amountCents,
        currency: charge.currency,
        status: charge.status,
        reference: charge.reference,
      },
    });
  },

  async charges(mandateId: string) {
    const rows = await db.mockCharge.findMany({
      where: { mandateId },
      orderBy: { createdAt: "asc" },
    });

    return rows.map((row) => ({
      chargeId: row.chargeId,
      mandateId: row.mandateId,
      amountCents: cents(row.amountCents),
      currency: row.currency as Currency,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      reference: row.reference,
    }));
  },
};
