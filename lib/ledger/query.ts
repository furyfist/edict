import { prisma } from "../db/client";
import {
  REFUSAL_OUTCOMES,
  type Actor,
  type LedgerEntry,
  type LedgerOutcome,
  type Money,
  type VerdictDecision,
  type VerdictReason,
} from "../contracts";

/**
 * Read-side access to the ledger.
 *
 * The refusal view is a filter over the one ledger model, not a second model.
 * That matters more than it looks: two models would let an entry exist in one
 * and not the other, and the first time those disagree the ledger stops being
 * evidence of anything.
 */

type Row = Awaited<ReturnType<typeof prisma.ledgerEntry.findMany>>[number];

function actor(id: string, label: string, kind: string): Actor {
  return { id, label, kind: kind as Actor["kind"] };
}

function money(cents: number | null, currency: string | null): Money | null {
  if (cents === null) return null;
  return { cents, currency: (currency ?? "USD") as Money["currency"] };
}

export function toLedgerEntry(row: Row): LedgerEntry {
  return {
    id: row.id,
    recordedAt: row.recordedAt.toISOString(),
    tickId: row.tickId,
    vendorId: row.vendorId,
    renewalId: row.renewalId,
    cycleKey: row.cycleKey,
    outcome: row.outcome as LedgerOutcome,
    amount: money(row.amountCents, row.currency),
    decidedBy: actor(row.decidedById, row.decidedByLabel, row.decidedByKind),
    authorizedBy: actor(
      row.authorizedById,
      row.authorizedByLabel,
      row.authorizedByKind,
    ),
    executedBy: actor(row.executedById, row.executedByLabel, row.executedByKind),
    recordedBy: actor(row.recordedById, row.recordedByLabel, row.recordedByKind),
    decision: (row.decision as VerdictDecision | null) ?? null,
    reason: (row.reason as VerdictReason | null) ?? null,
    citedRuleId: row.citedRuleId,
    citedSourceFragment: row.citedSourceFragment,
    policyVersionId: row.policyVersionId,
    agentRationale: row.agentRationale,
    agentRejectedAlternative: row.agentRejectedAlternative,
    prava: {
      mandateId: row.pravaMandateId,
      chargeId: row.pravaChargeId,
      sessionId: row.pravaSessionId,
    },
    correctsEntryId: row.correctsEntryId,
    detail: (row.detail as Record<string, unknown>) ?? {},
  };
}

export interface ListOptions {
  limit?: number;
  vendorId?: string;
  /** Restrict to outcomes in which no money moved. The refusal view. */
  refusalsOnly?: boolean;
}

/** Reverse-chronological, which is how the ledger page reads. */
export async function listEntries(
  options: ListOptions = {},
): Promise<LedgerEntry[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      ...(options.vendorId ? { vendorId: options.vendorId } : {}),
      ...(options.refusalsOnly
        ? { outcome: { in: REFUSAL_OUTCOMES as LedgerOutcome[] } }
        : {}),
    },
    orderBy: [{ recordedAt: "desc" }, { id: "desc" }],
    take: options.limit ?? 100,
  });
  return rows.map(toLedgerEntry);
}

/** The refusal view. One filter, one model. */
export async function listRefusals(limit = 100): Promise<LedgerEntry[]> {
  return listEntries({ refusalsOnly: true, limit });
}

export async function getEntry(id: string): Promise<LedgerEntry | null> {
  const row = await prisma.ledgerEntry.findUnique({ where: { id } });
  return row ? toLedgerEntry(row) : null;
}

/** Corrections that reference a given entry. Both remain readable. */
export async function listCorrections(
  entryId: string,
): Promise<LedgerEntry[]> {
  const rows = await prisma.ledgerEntry.findMany({
    where: { correctsEntryId: entryId },
    orderBy: { recordedAt: "asc" },
  });
  return rows.map(toLedgerEntry);
}

/** Whether this renewal and cycle has already been recorded. Idempotency read. */
export async function hasEntryForCycle(
  renewalId: string,
  cycleKey: string,
): Promise<boolean> {
  const found = await prisma.ledgerEntry.findFirst({
    where: { renewalId, cycleKey },
    select: { id: true },
  });
  return found !== null;
}

export interface LedgerTotals {
  executed: number;
  refused: number;
  executedCents: number;
  /** What was not spent because something refused it. */
  refusedCents: number;
}

export async function totals(): Promise<LedgerTotals> {
  const rows = await prisma.ledgerEntry.findMany({
    select: { outcome: true, amountCents: true },
  });

  let executed = 0;
  let refused = 0;
  let executedCents = 0;
  let refusedCents = 0;

  for (const row of rows) {
    const isRefusal = (REFUSAL_OUTCOMES as string[]).includes(row.outcome);
    if (isRefusal) {
      refused += 1;
      refusedCents += row.amountCents ?? 0;
    } else {
      executed += 1;
      executedCents += row.amountCents ?? 0;
    }
  }

  return { executed, refused, executedCents, refusedCents };
}
