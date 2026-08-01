import { randomUUID } from "node:crypto";
import { db } from "../db/client";
import { addDays } from "../clock";
import type { EvidenceBundle, Frequency, MandateStatus } from "../contracts";
import { assembleEvidence } from "./assemble";

/**
 * The pipeline's origin: one frozen snapshot that both the agent and the policy
 * engine read.
 *
 * They must read the same facts. If the agent saw one thing and the engine
 * another, you could not audit which was right — and the whole attribution chain
 * in the ledger would be fiction.
 *
 * This module owns no state. It is a read.
 */

const USAGE_LOOKBACK_DAYS = 45;

export async function buildEvidenceBundle(input: {
  renewalId: string;
  clock: Date;
}): Promise<EvidenceBundle | null> {
  const renewal = await db.renewal.findUnique({
    where: { id: input.renewalId },
    include: { vendor: true },
  });
  if (!renewal) return null;

  const vendorId = renewal.vendorId;
  const since = addDays(input.clock, -USAGE_LOOKBACK_DAYS);

  const [seats, usage, priorRenewals, mandate, messages] = await Promise.all([
    db.seat.findMany({
      where: { vendorId },
      select: { id: true, email: true },
      orderBy: { email: "asc" },
    }),
    db.usageRecord.findMany({
      where: { vendorId, day: { gte: since, lte: input.clock } },
      select: { seatId: true, day: true, loggedIn: true },
    }),
    db.renewal.findMany({
      where: { vendorId, cycleStart: { lt: renewal.cycleStart } },
      select: { cycleStart: true, amountCents: true },
      orderBy: { cycleStart: "asc" },
    }),
    db.mandate.findUnique({ where: { vendorId } }),
    db.inboundMessage.findMany({
      where: { vendorId, receivedAt: { lte: input.clock } },
      orderBy: { receivedAt: "desc" },
      take: 10,
    }),
  ]);

  return assembleEvidence({
    clock: input.clock,
    bundleId: randomUUID(),
    vendor: {
      id: renewal.vendor.id,
      name: renewal.vendor.name,
      category: renewal.vendor.category,
    },
    renewal: {
      id: renewal.id,
      cycleStart: renewal.cycleStart,
      dueDate: renewal.dueDate,
      amountCents: renewal.amountCents,
      currency: renewal.currency,
      frequency: renewal.frequency as Frequency,
    },
    seats,
    usage,
    priceHistory: priorRenewals,
    mandate: mandate
      ? {
          pravaMandateId: mandate.pravaMandateId,
          status: mandate.status as MandateStatus,
          capCents: mandate.capCents,
          remainingCents: mandate.remainingCents,
          expiresAt: mandate.expiresAt,
        }
      : null,
    messages,
  });
}

export { assembleEvidence } from "./assemble";
export type { EvidenceInput } from "./assemble";
