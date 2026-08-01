import { prisma } from "../db/client";
import { getPravaAdapter } from "./index";
import type { Mandate, MandateResult, PravaAdapter } from "./types";

/**
 * Mandate lifecycle, through the single boundary.
 *
 * Pause, resume, cancel, and read. Every one of these goes through the
 * adapter — there is no path in this file that writes a mandate status
 * directly to the database and calls it done. The local row is a mirror; the
 * network is the truth, and a mirror that disagrees with the truth is worse
 * than no mirror at all.
 *
 * That ordering is what makes the kill switch trustworthy: pausing writes to
 * Prava first, and the local row is updated from what Prava said, so a paused
 * mandate on our screen means a paused mandate on the network.
 */

export interface LifecycleResult {
  ok: boolean;
  mandate: Mandate | null;
  error: string | null;
}

export async function pauseMandate(
  pravaMandateId: string,
  adapter: PravaAdapter = getPravaAdapter(),
): Promise<LifecycleResult> {
  return apply(adapter.pauseMandate(pravaMandateId), pravaMandateId, "PAUSED");
}

export async function resumeMandate(
  pravaMandateId: string,
  adapter: PravaAdapter = getPravaAdapter(),
): Promise<LifecycleResult> {
  return apply(adapter.resumeMandate(pravaMandateId), pravaMandateId, "ACTIVE");
}

export async function cancelMandate(
  pravaMandateId: string,
  adapter: PravaAdapter = getPravaAdapter(),
): Promise<LifecycleResult> {
  return apply(
    adapter.cancelMandate(pravaMandateId),
    pravaMandateId,
    "CANCELLED",
  );
}

/**
 * Apply a lifecycle transition and mirror the result.
 *
 * The local row is only written when the network confirmed the change. A
 * failed pause leaves the mirror showing ACTIVE, which is correct — the
 * mandate really is still active, and showing otherwise would be a lie that
 * makes an operator think they are safe when they are not.
 */
async function apply(
  operation: Promise<MandateResult>,
  pravaMandateId: string,
  expected: Mandate["status"],
): Promise<LifecycleResult> {
  const result = await operation;

  if (!result.ok || !result.mandate) {
    return { ok: false, mandate: null, error: result.error ?? "unknown error" };
  }

  const state = await prisma.systemState.findUnique({
    where: { id: "singleton" },
  });

  await prisma.mandate
    .update({
      where: { pravaMandateId },
      data: {
        status: result.mandate.status,
        spentCents: result.mandate.spentCents,
        amountCeilingCents: result.mandate.amountCeilingCents,
        mirroredAt: state ? state.now : new Date(0),
      },
    })
    .catch(() => {
      // The network transition succeeded; a mirror write failure must not
      // report the transition as failed. The next tick's refresh corrects it.
    });

  return {
    ok: true,
    mandate: result.mandate,
    error:
      result.mandate.status === expected
        ? null
        : `The network reports the mandate as ${result.mandate.status}.`,
  };
}

/**
 * Refresh every mirrored mandate from the network.
 *
 * Called at the top of each tick, before anything is adjudicated. Prava owns
 * mandate status and remaining authority; adjudicating against a stale local
 * copy would mean deciding on facts that were true some time ago.
 *
 * A failed refresh does not halt the tick. It is recorded and the tick
 * continues on the last known state — halting the whole system because one
 * mandate read timed out would trade a small inaccuracy for a total outage.
 */
export interface RefreshSummary {
  refreshed: number;
  failed: number;
  errors: string[];
}

export async function refreshMandateMirror(
  adapter: PravaAdapter = getPravaAdapter(),
): Promise<RefreshSummary> {
  const rows = await prisma.mandate.findMany({
    orderBy: { pravaMandateId: "asc" },
    select: { pravaMandateId: true },
  });

  const summary: RefreshSummary = { refreshed: 0, failed: 0, errors: [] };
  const state = await prisma.systemState.findUnique({
    where: { id: "singleton" },
  });
  const mirroredAt = state ? state.now : new Date(0);

  for (const row of rows) {
    const result = await adapter.getMandate(row.pravaMandateId);

    if (!result.ok || !result.mandate) {
      summary.failed += 1;
      summary.errors.push(
        `${row.pravaMandateId}: ${result.error ?? "unreadable"}`,
      );
      continue;
    }

    await prisma.mandate.update({
      where: { pravaMandateId: row.pravaMandateId },
      data: {
        status: result.mandate.status,
        amountCeilingCents: result.mandate.amountCeilingCents,
        spentCents: result.mandate.spentCents,
        expiresAt: result.mandate.expiresAt
          ? new Date(result.mandate.expiresAt)
          : null,
        mirroredAt,
      },
    });
    summary.refreshed += 1;
  }

  return summary;
}

/** Remaining authority, as a depleting quantity. Rendered on the authority page. */
export interface MandateView {
  pravaMandateId: string;
  vendorId: string;
  status: string;
  authorizedCents: number;
  spentCents: number;
  remainingCents: number;
  currency: string;
  expiresAt: Date | null;
  mirroredAt: Date;
}

export async function listMandateViews(): Promise<MandateView[]> {
  const rows = await prisma.mandate.findMany({
    orderBy: [{ vendorId: "asc" }, { pravaMandateId: "asc" }],
  });

  return rows.map((row) => ({
    pravaMandateId: row.pravaMandateId,
    vendorId: row.vendorId,
    status: row.status,
    authorizedCents: row.amountCeilingCents,
    spentCents: row.spentCents,
    remainingCents: Math.max(0, row.amountCeilingCents - row.spentCents),
    currency: row.currency,
    expiresAt: row.expiresAt,
    mirroredAt: row.mirroredAt,
  }));
}

/** Pause every active mandate. The kill switch's payment-side action. */
export async function pauseAllMandates(
  adapter: PravaAdapter = getPravaAdapter(),
): Promise<{ paused: string[]; failed: string[] }> {
  const rows = await prisma.mandate.findMany({
    where: { status: "ACTIVE" },
    orderBy: { pravaMandateId: "asc" },
    select: { pravaMandateId: true },
  });

  const paused: string[] = [];
  const failed: string[] = [];

  for (const row of rows) {
    const result = await pauseMandate(row.pravaMandateId, adapter);
    if (result.ok) paused.push(row.pravaMandateId);
    else failed.push(row.pravaMandateId);
  }

  return { paused, failed };
}
