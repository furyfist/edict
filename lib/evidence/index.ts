import { prisma } from "../db/client";
import { plusDays } from "../clock";
import {
  type EvidenceBundle,
  type EvidenceGap,
  type PriceChange,
  type SeatUsage,
  type VendorMessage,
  money,
} from "../contracts";

/**
 * The evidence builder.
 *
 * It assembles one frozen snapshot per renewal per tick. Both the agent and the
 * policy engine read that same snapshot: the agent to form a proposal, the
 * engine to adjudicate one. Two readers of one snapshot is what makes the
 * adjudication meaningful — the engine re-derives every fact it decides on
 * rather than taking the agent's word for any of them.
 *
 * A bundle is assembled once and never mutated.
 *
 * Absent facts become named gaps rather than exceptions. That is deliberate:
 * "we do not know the seat usage" is an input the engine can reason about,
 * whereas a thrown error is a decision made by whoever wrote the catch block.
 */

/** How far back usage is considered fresh. Older than this is a STALE gap. */
export const USAGE_WINDOW_DAYS = 30;

/** How far back vendor messages are collected for a bundle. */
export const MESSAGE_WINDOW_DAYS = 14;

export interface BuildEvidenceOptions {
  renewalId: string;
  /** The demo-clock instant this snapshot is taken at. Never wall time. */
  observedAt: Date;
}

export async function buildEvidenceBundle(
  options: BuildEvidenceOptions,
): Promise<EvidenceBundle> {
  const { renewalId, observedAt } = options;

  const renewal = await prisma.renewal.findUnique({
    where: { id: renewalId },
    include: { vendor: true },
  });

  if (!renewal) {
    throw new Error(`No renewal ${renewalId}. Evidence cannot be assembled.`);
  }

  const gaps: EvidenceGap[] = [];
  const vendor = renewal.vendor;

  // ---- seats ----
  const seatRow = await prisma.seatRecord.findFirst({
    where: { vendorId: vendor.id, observedAt: { lte: observedAt } },
    orderBy: { observedAt: "desc" },
  });

  let seats: SeatUsage | null = null;
  if (!seatRow) {
    gaps.push("NO_USAGE_DATA");
  } else {
    seats = {
      licensed: seatRow.licensed,
      active: seatRow.active,
      dormant: seatRow.dormant,
      windowDays: seatRow.windowDays,
    };
    const staleBefore = plusDays(observedAt, -USAGE_WINDOW_DAYS);
    if (seatRow.observedAt < staleBefore) {
      // The data exists but is old enough that acting on it unattended would be
      // acting on a guess. Named, not silently accepted.
      gaps.push("STALE_USAGE_DATA");
    }
  }

  // ---- prior invoice and price movement ----
  const priorCents = renewal.priorCycleAmountCents;
  const previousCents = renewal.previousAmountCents;

  if (priorCents === null) {
    gaps.push("NO_PRIOR_INVOICE");
  }

  let priceChange: PriceChange | null = null;
  if (previousCents !== null && previousCents > 0) {
    const delta = renewal.amountCents - previousCents;
    priceChange = {
      previous: money(previousCents),
      current: money(renewal.amountCents),
      // Integer basis points. No floating point in a figure a rule compares on.
      deltaBasisPoints: Math.round((delta * 10_000) / previousCents),
    };
  }

  if (!vendor.merchantId) {
    // Without a merchant id there is nothing to pin a mandate to, so the vendor
    // is not one this system can pay unattended.
    gaps.push("UNKNOWN_VENDOR");
  }

  // ---- vendor messages ----
  const messageRows = await prisma.vendorMessage.findMany({
    where: {
      vendorId: vendor.id,
      receivedAt: {
        gte: plusDays(observedAt, -MESSAGE_WINDOW_DAYS),
        lte: observedAt,
      },
    },
    orderBy: { receivedAt: "asc" },
  });

  const messages: VendorMessage[] = messageRows.map((m) => ({
    id: m.id,
    receivedAt: m.receivedAt.toISOString(),
    subject: m.subject,
    body: m.body,
    injected: m.injected,
  }));

  return {
    // Deterministic: the same renewal at the same instant yields the same id.
    bundleId: `bundle_${renewal.id}_${observedAt.toISOString()}`,
    observedAt: observedAt.toISOString(),
    vendor: {
      id: vendor.id,
      name: vendor.name,
      category: vendor.category,
      merchantId: vendor.merchantId,
    },
    renewal: {
      id: renewal.id,
      dueAt: renewal.dueAt.toISOString(),
      amount: money(renewal.amountCents),
      cadence: renewal.cadence,
      cycleKey: renewal.cycleKey,
    },
    seats,
    priceChange,
    priorCycleAmount: priorCents === null ? null : money(priorCents),
    messages,
    gaps,
  };
}

/**
 * Renewals a tick should consider: pending, and due within the horizon.
 * Ordered by id so a tick processes them in the same order every time.
 */
export async function selectDueRenewals(
  observedAt: Date,
  horizonDays = 7,
): Promise<string[]> {
  const rows = await prisma.renewal.findMany({
    where: {
      state: "PENDING",
      dueAt: { lte: plusDays(observedAt, horizonDays) },
    },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
