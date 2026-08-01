import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "../db/client";
import type {
  Action,
  AuthorizedBy,
  Cents,
  DecidedBy,
  EvidenceBundle,
  ExecutedBy,
  HaltReason,
  LedgerEntry,
  LedgerError,
  Outcome,
  ProposalAlternative,
  RefusalCode,
} from "../contracts";
import { GENESIS_PREV_DIGEST, issueReceipt } from "../attest";
import { isoDate, wallNow } from "../clock";
import { CHAIN_ORDER, toSignedRecord } from "./record";

/**
 * The ledger writer. APPEND-ONLY.
 *
 * This module exports exactly one mutating function: `appendEntry`. There is no
 * update path and no delete path, and adding one would break the product's
 * credibility argument — "can you edit these?" needs a one-word answer.
 *
 * A correction is a new entry carrying `correctsEntryId`.
 *
 * ---------------------------------------------------------------------------
 * CAPTURE BEFORE CHARGE
 *
 * The draft is assembled BEFORE the adapter is called, and the write happens
 * after. That ordering is deliberate: if the charge succeeds and the process
 * dies before the write, the draft still holds everything needed to reconstruct
 * the entry. Money that moved must never be invisible.
 *
 * Do not "improve" this by building the entry after the charge returns.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * RECEIPTS
 *
 * Every entry is signed and hash-linked to its predecessor here, at the single
 * write path — so the tick runner, the outcome router, and the demo bypass all
 * inherit receipts without changing a line at any call site.
 *
 * Two rules govern the addition:
 *
 *   1. The signed shape is the CONTRACT projection, not this row. See
 *      ./record.ts, which explains why that distinction is load-bearing.
 *   2. Signing can never prevent a write. `issueReceipt` does not throw, and a
 *      missing key yields an unsigned-but-chained entry. An unattested entry is
 *      a fact the interface reports; a lost record of a charge that already
 *      happened is a violated invariant.
 * ---------------------------------------------------------------------------
 */

/** Everything knowable before execution is attempted. */
export interface LedgerDraft {
  tickId: string;
  clockAt: Date;

  vendorId: string;
  vendorName: string;
  renewalId: string;
  cycleStart: Date;

  proposedAction: Action;
  proposedAmountCents: Cents;

  decidedBy: DecidedBy | null;
  authorizedBy: AuthorizedBy | null;

  evidence: EvidenceBundle;
  alternative: ProposalAlternative | null;
  agentRationale: string | null;

  /** What would be paid if the agent did nothing. Known before any charge. */
  counterfactualCents: Cents;
}

export interface LedgerCompletion {
  outcome: Outcome;
  refusalCode?: RefusalCode | null;
  haltReason?: HaltReason | null;
  executedBy?: ExecutedBy | null;
  /** What actually moved. Zero on anything other than EXECUTED. */
  chargedCents: Cents;
  explanation: string;
  counterfactual: string;
  error?: LedgerError | null;
  correctsEntryId?: string | null;
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/**
 * The digest this entry will link to.
 *
 * Reads the tail of the chain under the ordering both sides agree on. Ticks
 * hold the single-flight lock, and the demo bypass is the only other writer, so
 * this read-modify-write is not serialized further. Two genuinely simultaneous
 * appends could fork the chain — a known, accepted limit at this scale, and the
 * first thing a chain-head table would fix.
 */
async function previousDigest(): Promise<string> {
  const last = await db.ledgerEntry.findFirst({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { receiptDigest: true },
  });

  return last?.receiptDigest ?? GENESIS_PREV_DIGEST;
}

export async function appendEntry(
  draft: LedgerDraft,
  completion: LedgerCompletion,
): Promise<string> {
  // Generated here rather than by the database, because the receipt must cover
  // the identity and timestamp a reader will see.
  const id = randomUUID();
  const createdAt = wallNow();

  const financialImpact = {
    chargedCents: completion.chargedCents,
    counterfactualCents: draft.counterfactualCents,
    savedCents: draft.counterfactualCents - completion.chargedCents,
  };

  // The contract projection — byte-for-byte what lib/ledger/read.ts will
  // reconstruct from the row below.
  const projection: LedgerEntry = {
    id,
    tickId: draft.tickId,
    createdAt: createdAt.toISOString(),
    clockAt: draft.clockAt.toISOString(),

    vendorId: draft.vendorId,
    vendorName: draft.vendorName,
    renewalId: draft.renewalId,
    cycleStart: isoDate(draft.cycleStart),

    proposedAction: draft.proposedAction,
    proposedAmountCents: draft.proposedAmountCents,

    outcome: completion.outcome,
    refusalCode: completion.refusalCode ?? null,
    haltReason: completion.haltReason ?? null,

    decidedBy: draft.decidedBy,
    authorizedBy: draft.authorizedBy,
    executedBy: completion.executedBy ?? null,

    amountCents: completion.chargedCents,
    currency: "USD",
    financialImpact,

    evidence: draft.evidence,

    explanation: completion.explanation,
    counterfactual: completion.counterfactual,
    alternative: draft.alternative,
    agentRationale: draft.agentRationale,

    correctsEntryId: completion.correctsEntryId ?? null,
    error: completion.error ?? null,

    receipt: null,
  };

  const receipt = issueReceipt(
    toSignedRecord(projection),
    await previousDigest(),
  );

  const entry = await db.ledgerEntry.create({
    data: {
      id,
      createdAt,

      tickId: draft.tickId,
      clockAt: draft.clockAt,

      vendorId: draft.vendorId,
      vendorName: draft.vendorName,
      renewalId: draft.renewalId,
      cycleStart: draft.cycleStart,

      proposedAction: draft.proposedAction,
      proposedAmountCents: draft.proposedAmountCents,

      outcome: completion.outcome,
      refusalCode: completion.refusalCode ?? null,
      haltReason: completion.haltReason ?? null,

      decidedBy: draft.decidedBy ? json(draft.decidedBy) : Prisma.JsonNull,
      authorizedBy: draft.authorizedBy ? json(draft.authorizedBy) : Prisma.JsonNull,
      executedBy: completion.executedBy
        ? json(completion.executedBy)
        : Prisma.JsonNull,

      amountCents: completion.chargedCents,
      currency: "USD",
      financialImpact: json(financialImpact),

      evidence: json(draft.evidence),

      explanation: completion.explanation,
      counterfactual: completion.counterfactual,
      alternative: draft.alternative ? json(draft.alternative) : Prisma.JsonNull,
      agentRationale: draft.agentRationale,

      correctsEntryId: completion.correctsEntryId ?? null,
      error: completion.error ? json(completion.error) : Prisma.JsonNull,

      receiptDigest: receipt.digest,
      receiptPrevDigest: receipt.prevDigest,
      receiptSignature: receipt.signature,
      receiptKeyId: receipt.keyId,
      receiptCanonVersion: receipt.canonVersion,
    },
    select: { id: true },
  });

  return entry.id;
}

// Re-exported for the router. Deliberately no `updateEntry` and no `deleteEntry`.
export { Prisma };
