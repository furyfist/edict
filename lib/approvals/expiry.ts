import { prisma } from "../db/client";
import { now } from "../clock";
import { AGENT, NOBODY, appendEntry } from "../ledger";

/**
 * Approval expiry.
 *
 * Consent is to act on specific evidence, and evidence ages. An approval
 * granted against a bundle showing 18 of 20 seats active does not carry
 * forward to a world where 4 of 20 are active — the human agreed to something
 * that is no longer the situation.
 *
 * Expiry is enforced in two places, deliberately:
 *
 *   At the point of use, in `checkActionable`, which is the check that matters
 *   for correctness — it cannot lag, and it is what stands between an expired
 *   approval and a charge.
 *
 *   Here, as a sweep, which is what matters for honesty — it moves rows to
 *   EXPIRED so the approvals page shows the truth rather than a live-looking
 *   button that will refuse when pressed.
 *
 * An expired approval is never revived. There is no un-expire path anywhere,
 * and a test asserts it. If the situation still warrants the action, the next
 * tick raises a fresh approval against fresh evidence, which is the correct
 * outcome — a new decision on new facts rather than an old decision reused.
 */

export interface ExpirySweepResult {
  expired: number;
  approvalIds: string[];
}

export async function sweepExpiredApprovals(): Promise<ExpirySweepResult> {
  const instant = await now();

  const stale = await prisma.approvalRequest.findMany({
    where: { status: "PENDING", expiresAt: { lte: instant } },
    orderBy: { requestedAt: "asc" },
  });

  const approvalIds: string[] = [];

  for (const row of stale) {
    await prisma.approvalRequest.update({
      where: { id: row.id },
      data: { status: "EXPIRED", resolvedAt: instant },
    });

    // An expiry is a thing that happened and it belongs in the ledger. A
    // pending approval that quietly disappears from the page is
    // indistinguishable from one that was silently approved.
    await appendEntry({
      recordedAt: instant,
      tickId: `expiry_${row.id}`,
      vendorId: row.vendorId,
      renewalId: null,
      cycleKey: null,
      outcome: "EXPIRED",
      amount: { cents: row.amountCents, currency: "USD" },
      decidedBy: AGENT,
      authorizedBy: NOBODY,
      executedBy: NOBODY,
      detail: {
        approvalId: row.id,
        requestedAt: row.requestedAt.toISOString(),
        expiredAt: row.expiresAt.toISOString(),
        note: "Nothing was charged. Consent lapsed before it was acted on.",
      },
    });

    approvalIds.push(row.id);
  }

  return { expired: approvalIds.length, approvalIds };
}
