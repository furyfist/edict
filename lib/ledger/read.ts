import { db } from "../db/client";
import type {
  Action,
  AuthorizedBy,
  Cents,
  DecidedBy,
  EvidenceBundle,
  ExecutedBy,
  FinancialImpact,
  HaltReason,
  LedgerEntry,
  LedgerError,
  Outcome,
  ProposalAlternative,
  RefusalCode,
} from "../contracts";
import { isoDate } from "../clock";
import {
  GENESIS_PREV_DIGEST,
  getPublicIdentity,
  verifyReceipt,
  type ReceiptStatus,
} from "../attest";
import { CHAIN_ORDER, toSignedRecord } from "./record";

export interface VerifiedEntry {
  entry: LedgerEntry;
  status: ReceiptStatus;
}

/**
 * Ledger reads.
 *
 * The refusal view is a FILTER over this same model, not a separate table and
 * not a separate concept. One data model, two doors — a single prioritized
 * record reads as an agent's work log, whereas parallel sections read as a BI
 * tool. The information architecture is part of the argument.
 */

type Row = Awaited<ReturnType<typeof db.ledgerEntry.findFirst>>;

function toEntry(row: NonNullable<Row>): LedgerEntry {
  return {
    id: row.id,
    tickId: row.tickId,
    createdAt: row.createdAt.toISOString(),
    clockAt: row.clockAt.toISOString(),

    vendorId: row.vendorId,
    vendorName: row.vendorName,
    renewalId: row.renewalId,
    cycleStart: isoDate(row.cycleStart),

    proposedAction: row.proposedAction as Action,
    proposedAmountCents: row.proposedAmountCents as Cents,

    outcome: row.outcome as Outcome,
    refusalCode: (row.refusalCode as RefusalCode | null) ?? null,
    haltReason: (row.haltReason as HaltReason | null) ?? null,

    decidedBy: (row.decidedBy as DecidedBy | null) ?? null,
    authorizedBy: (row.authorizedBy as AuthorizedBy | null) ?? null,
    executedBy: (row.executedBy as ExecutedBy | null) ?? null,

    amountCents: row.amountCents as Cents,
    currency: "USD",
    financialImpact: row.financialImpact as unknown as FinancialImpact,

    evidence: row.evidence as unknown as EvidenceBundle,

    explanation: row.explanation,
    counterfactual: row.counterfactual,
    alternative: (row.alternative as ProposalAlternative | null) ?? null,
    agentRationale: row.agentRationale,

    correctsEntryId: row.correctsEntryId,
    error: (row.error as LedgerError | null) ?? null,

    receipt: row.receiptDigest
      ? {
          canonVersion: row.receiptCanonVersion ?? "unknown",
          prevDigest: row.receiptPrevDigest ?? GENESIS_PREV_DIGEST,
          digest: row.receiptDigest,
          signature: row.receiptSignature,
          keyId: row.receiptKeyId,
        }
      : null,
  };
}

/**
 * The chain, oldest first, with each entry's verification status.
 *
 * Status is COMPUTED ON READ and never stored — §11's rule. A stored
 * verification result would be a derived value that drifts from its input,
 * which is the exact failure the ledger exists to prevent.
 */
export async function verifiedChain(): Promise<VerifiedEntry[]> {
  const rows = await db.ledgerEntry.findMany({ orderBy: [...CHAIN_ORDER] });
  const identity = getPublicIdentity();

  let expectedPrev: string = GENESIS_PREV_DIGEST;
  const out: VerifiedEntry[] = [];

  for (const row of rows) {
    const entry = toEntry(row);

    if (!entry.receipt) {
      // Pre-receipt entries do not participate in the chain. They break nothing
      // and they claim nothing.
      out.push({ entry, status: "UNATTESTED" });
      continue;
    }

    out.push({
      entry,
      status: verifyReceipt({
        record: toSignedRecord(entry),
        receipt: entry.receipt,
        publicKeyB64: identity?.publicKeyB64 ?? null,
        expectedPrevDigest: expectedPrev,
      }),
    });

    expectedPrev = entry.receipt.digest;
  }

  return out;
}

/** Verification status for one entry, in the context of the whole chain. */
export async function verifyEntry(id: string): Promise<ReceiptStatus | null> {
  const chain = await verifiedChain();
  return chain.find((item) => item.entry.id === id)?.status ?? null;
}

export async function listEntries(options: {
  outcome?: Outcome;
  vendorId?: string;
  limit?: number;
} = {}): Promise<LedgerEntry[]> {
  const rows = await db.ledgerEntry.findMany({
    where: {
      ...(options.outcome ? { outcome: options.outcome } : {}),
      ...(options.vendorId ? { vendorId: options.vendorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: options.limit ?? 100,
  });

  return rows.map(toEntry);
}

/** What the agent would not do. The most trust-generating surface here. */
export async function listRefusals(limit = 100): Promise<LedgerEntry[]> {
  return listEntries({ outcome: "REFUSED", limit });
}

export async function getEntry(id: string): Promise<LedgerEntry | null> {
  const row = await db.ledgerEntry.findUnique({ where: { id } });
  return row ? toEntry(row) : null;
}

/** Whether this renewal cycle has already been adjudicated. Idempotency. */
export async function hasEntryForCycle(input: {
  renewalId: string;
  cycleStart: Date;
}): Promise<boolean> {
  const count = await db.ledgerEntry.count({
    where: { renewalId: input.renewalId, cycleStart: input.cycleStart },
  });
  return count > 0;
}

export async function countsByOutcome(): Promise<Record<string, number>> {
  const grouped = await db.ledgerEntry.groupBy({
    by: ["outcome"],
    _count: { _all: true },
  });

  return Object.fromEntries(
    grouped.map((group) => [group.outcome, group._count._all]),
  );
}
