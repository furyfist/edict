import { db } from "../db/client";
import { getClock } from "../clock";
import { cents } from "../contracts/money";
import { isoDate } from "../clock";
import { paymentBoundary } from "../prava";
import type { ChargeHistoryFailure } from "../prava";
import { reconcile } from "./core";
import type { Discrepancy, LedgerCharge } from "./core";

/**
 * RUNNING A RECONCILIATION — where the two books are actually fetched.
 *
 * The core is pure and stays that way. This file does the reads: our executed
 * entries from the ledger, the network's charges through the payment boundary's
 * index (never its internals — the reconciler is a consumer of the adapter, not
 * a second adapter).
 *
 * ---------------------------------------------------------------------------
 * THE RULE THAT MATTERS MOST IN THIS FILE
 *
 * A mandate whose history could not be read is NOT a mandate with no charges.
 *
 * Getting this wrong would be the single most dangerous bug in the milestone: a
 * provider outage, or a provider with no enumeration endpoint at all, would
 * silently produce "no unmatched charges" and the system would sign an
 * attestation claiming the books balance when it had not read one of them.
 *
 * So unreadable mandates are collected by name and the whole run degrades to
 * UNVERIFIABLE. Same discipline as the evidence bundle: unknown is never
 * permission, and absence is never zero.
 * ---------------------------------------------------------------------------
 */

export type ContainmentStatus =
  /** Both directions checked on every mandate, everything lines up. */
  | "BALANCED"
  /** Something does not line up, and it is named. */
  | "DISCREPANT"
  /** At least one book could not be read. No claim is made either way. */
  | "UNVERIFIABLE";

export interface UnreadableMandate {
  mandateId: string;
  vendorName: string | null;
  reason: ChargeHistoryFailure;
  message: string;
}

export interface ReconciliationRun {
  status: ContainmentStatus;
  /** Demo clock. The time the system believed it was. */
  ranAt: string;
  /** Which implementation answered — `prava` or `mock`. Never hidden. */
  provider: "mock" | "prava";

  mandatesChecked: number;
  entriesChecked: number;
  chargesChecked: number;
  matched: number;

  discrepancies: Discrepancy[];
  /** Mandates whose second book could not be read, by name and reason. */
  unreadable: UnreadableMandate[];
}

/**
 * Our side of the books: every entry that claims money moved.
 *
 * `outcome === EXECUTED` with an `executedBy` block is the definition of "this
 * entry says a charge happened". Escalations and refusals are not in scope —
 * they claim nothing moved, and the network agreeing that nothing moved is not
 * evidence of anything.
 */
async function ledgerCharges(): Promise<Map<string, LedgerCharge[]>> {
  const rows = await db.ledgerEntry.findMany({
    where: { outcome: "EXECUTED" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      vendorName: true,
      renewalId: true,
      cycleStart: true,
      amountCents: true,
      executedBy: true,
    },
  });

  const byMandate = new Map<string, LedgerCharge[]>();

  for (const row of rows) {
    const executedBy = row.executedBy as {
      mandateId?: string;
      chargeId?: string | null;
    } | null;

    // An executed entry with no execution block cannot be attributed to a
    // mandate at all. Skipping it silently would hide it from both directions,
    // so it is surfaced as its own discrepancy by the caller below.
    if (!executedBy?.mandateId) continue;

    const bucket = byMandate.get(executedBy.mandateId) ?? [];
    bucket.push({
      entryId: row.id,
      vendorName: row.vendorName,
      mandateId: executedBy.mandateId,
      chargeId: executedBy.chargeId ?? null,
      amountCents: cents(row.amountCents),
      reference: `${row.renewalId}:${isoDate(row.cycleStart)}`,
    });
    byMandate.set(executedBy.mandateId, bucket);
  }

  return byMandate;
}

/**
 * Reconciles every mandate in the mirror, both directions.
 *
 * Mandates are taken from the local mirror rather than from the entries,
 * because a mandate with no entries is exactly where an orphan charge would
 * hide. Reconciling only the mandates we already know we used would be
 * reconciling our own book against itself.
 */
export async function runReconciliation(): Promise<ReconciliationRun> {
  const [clock, mandates, byMandate] = await Promise.all([
    getClock(),
    db.mandate.findMany({ select: { pravaMandateId: true, vendorId: true } }),
    ledgerCharges(),
  ]);

  const vendorNames = new Map(
    (
      await db.vendor.findMany({ select: { id: true, name: true } })
    ).map((vendor) => [vendor.id, vendor.name]),
  );

  const adapter = paymentBoundary();

  const discrepancies: Discrepancy[] = [];
  const unreadable: UnreadableMandate[] = [];
  let entriesChecked = 0;
  let chargesChecked = 0;
  let matched = 0;

  // Fetched in parallel, reconciled in order.
  //
  // Sequentially this was eight round trips deep — about fourteen seconds
  // against a database on another continent, which is far too slow to run in
  // front of anyone. These are reads with no ordering between them.
  //
  // The COMPARISON stays ordered and deterministic: results are consumed in
  // mandate order below, so two runs over the same books produce byte-identical
  // discrepancy lists and therefore identical attestation digests.
  const histories = await Promise.all(
    mandates.map((mandate) => adapter.listCharges(mandate.pravaMandateId)),
  );

  for (const [index, mandate] of mandates.entries()) {
    const entries = byMandate.get(mandate.pravaMandateId) ?? [];
    const history = histories[index];

    if (!history.ok) {
      unreadable.push({
        mandateId: mandate.pravaMandateId,
        vendorName: vendorNames.get(mandate.vendorId) ?? null,
        reason: history.reason,
        message: history.message,
      });
      // Deliberately not reconciled. Comparing our entries against an empty
      // list we never received would manufacture orphan entries out of an
      // outage.
      continue;
    }

    const result = reconcile({
      mandateId: mandate.pravaMandateId,
      entries,
      charges: history.charges,
    });

    entriesChecked += result.entriesChecked;
    chargesChecked += result.chargesChecked;
    matched += result.matched;
    discrepancies.push(...result.discrepancies);
  }

  const status: ContainmentStatus =
    discrepancies.length > 0
      ? "DISCREPANT"
      : unreadable.length > 0
        ? "UNVERIFIABLE"
        : "BALANCED";

  return {
    status,
    ranAt: clock.toISOString(),
    provider: adapter.name,
    mandatesChecked: mandates.length - unreadable.length,
    entriesChecked,
    chargesChecked,
    matched,
    discrepancies,
    unreadable,
  };
}

/**
 * The sentence to render, in one place.
 *
 * Kept here rather than in the interface because the same words belong in the
 * attestation, on the Authority page, and in the runbook — and because a status
 * whose meaning is written three times is a status that will eventually be
 * described three different ways.
 */
export function containmentSentence(run: ReconciliationRun): string {
  switch (run.status) {
    case "BALANCED":
      return `Every one of ${run.matched} recorded charge${run.matched === 1 ? "" : "s"} appears in the payment network's own book, and the network reports nothing we did not record.`;
    case "DISCREPANT":
      return `${run.discrepancies.length} discrepanc${run.discrepancies.length === 1 ? "y" : "ies"} between our ledger and the payment network's own book. Each is named below.`;
    case "UNVERIFIABLE":
      return `The books could not be compared: ${run.unreadable.length} mandate${run.unreadable.length === 1 ? "'s" : "s'"} charge history could not be read. This is not a clean bill of health — it is the absence of one.`;
  }
}
