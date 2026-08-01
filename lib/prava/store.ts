import { cents } from "../contracts/money";
import type { Cents, MandateStatus } from "../contracts";
import { db } from "../db/client";
import type { MandateSnapshot, MandateStore } from "./types";

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
};
