import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import type {
  Actor,
  LedgerEntry,
  LedgerOutcome,
  Money,
  VerdictDecision,
  VerdictReason,
} from "../contracts";
import { NOBODY, TICK } from "./actors";

/**
 * The ledger writer.
 *
 * Append-only, and the enforcement is structural: this module exports one
 * function that inserts, and no function that updates or deletes. There is no
 * `updateEntry`, no `correctEntry` that mutates, and no soft-delete flag. A
 * correction is a new entry carrying `correctsEntryId`, which means the record
 * of a mistake and the record of its correction both survive.
 *
 * Capture-before-charge ordering lives here too. `openEntry` records the
 * intention to charge before the adapter is called, and `closeEntry` appends
 * the result afterwards. If the process dies between the two, the intention is
 * already on disk — money that moved is never invisible.
 */

export interface WriteEntryInput {
  recordedAt: Date;
  tickId: string;
  vendorId: string;
  renewalId: string | null;
  cycleKey: string | null;
  outcome: LedgerOutcome;
  amount: Money | null;

  decidedBy: Actor;
  authorizedBy: Actor;
  executedBy?: Actor;
  recordedBy?: Actor;

  decision?: VerdictDecision | null;
  reason?: VerdictReason | null;
  citedRuleId?: string | null;
  citedSourceFragment?: string | null;
  policyVersionId?: string | null;

  agentRationale?: string | null;
  agentRejectedAlternative?: string | null;

  pravaMandateId?: string | null;
  pravaChargeId?: string | null;
  pravaSessionId?: string | null;

  correctsEntryId?: string | null;
  detail?: Record<string, unknown>;
}

/** Raised when the idempotency constraint rejects a duplicate. Not an error. */
export class DuplicateEntryError extends Error {
  constructor(
    readonly renewalId: string,
    readonly cycleKey: string,
  ) {
    super(
      `An entry already exists for renewal ${renewalId} in cycle ${cycleKey}.`,
    );
    this.name = "DuplicateEntryError";
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Append one entry. The only write path this module has.
 *
 * All four attributions are always written: an entry that cannot say who
 * executed it says "nobody" explicitly rather than leaving the field empty.
 */
export async function appendEntry(input: WriteEntryInput): Promise<string> {
  const executedBy = input.executedBy ?? NOBODY;
  const recordedBy = input.recordedBy ?? TICK;

  try {
    const row = await prisma.ledgerEntry.create({
      data: {
        recordedAt: input.recordedAt,
        tickId: input.tickId,
        vendorId: input.vendorId,
        renewalId: input.renewalId,
        cycleKey: input.cycleKey,
        outcome: input.outcome,
        amountCents: input.amount ? input.amount.cents : null,
        currency: input.amount ? input.amount.currency : null,

        decidedById: input.decidedBy.id,
        decidedByLabel: input.decidedBy.label,
        decidedByKind: input.decidedBy.kind,
        authorizedById: input.authorizedBy.id,
        authorizedByLabel: input.authorizedBy.label,
        authorizedByKind: input.authorizedBy.kind,
        executedById: executedBy.id,
        executedByLabel: executedBy.label,
        executedByKind: executedBy.kind,
        recordedById: recordedBy.id,
        recordedByLabel: recordedBy.label,
        recordedByKind: recordedBy.kind,

        decision: input.decision ?? null,
        reason: input.reason ?? null,
        citedRuleId: input.citedRuleId ?? null,
        citedSourceFragment: input.citedSourceFragment ?? null,
        policyVersionId: input.policyVersionId ?? null,

        agentRationale: input.agentRationale ?? null,
        agentRejectedAlternative: input.agentRejectedAlternative ?? null,

        pravaMandateId: input.pravaMandateId ?? null,
        pravaChargeId: input.pravaChargeId ?? null,
        pravaSessionId: input.pravaSessionId ?? null,

        correctsEntryId: input.correctsEntryId ?? null,
        detail: (input.detail ?? {}) as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    if (isUniqueViolation(error) && input.renewalId && input.cycleKey) {
      throw new DuplicateEntryError(input.renewalId, input.cycleKey);
    }
    throw error;
  }
}

/**
 * Append a correction. The prior entry is untouched; both remain readable, and
 * the ledger shows that a correction happened rather than hiding it.
 */
export async function appendCorrection(
  correctsEntryId: string,
  input: Omit<WriteEntryInput, "correctsEntryId" | "renewalId" | "cycleKey">,
): Promise<string> {
  // Corrections carry no renewal/cycle key, so they never collide with the
  // idempotency constraint on the entry they correct.
  return appendEntry({
    ...input,
    renewalId: null,
    cycleKey: null,
    correctsEntryId,
  });
}

export function toContractOutcome(entry: {
  amountCents: number | null;
  currency: string | null;
}): Money | null {
  if (entry.amountCents === null) return null;
  return {
    cents: entry.amountCents,
    currency: (entry.currency ?? "USD") as Money["currency"],
  };
}

export type { LedgerEntry };
