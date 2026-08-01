import { prisma } from "../db/client";
import type { Money } from "../contracts";
import { appendEntry, type WriteEntryInput } from "./write";

/**
 * Capture-before-charge.
 *
 * The ordering rule this file exists to enforce: the intention to move money is
 * durable before the money moves. If the adapter call succeeds and the process
 * dies before the result is recorded, the ledger still shows that a charge was
 * attempted, against which mandate, for how much. An operator can reconcile
 * that. An operator cannot reconcile a charge nobody wrote down.
 *
 * The alternative ordering — call the adapter, then record what happened — is
 * simpler and is wrong for exactly one case, which is the case that matters.
 *
 * The intent row is written with outcome ADAPTER_FAILURE. A row that is never
 * closed therefore reads, correctly, as a charge whose result is unknown. The
 * pessimistic initial value is deliberate: a crash leaves behind the honest
 * record rather than an optimistic one.
 */

export interface CaptureIntentInput
  extends Omit<WriteEntryInput, "outcome" | "pravaChargeId"> {
  amount: Money;
  pravaMandateId: string;
}

/** Record the intention to charge. Returns the entry id to close afterwards. */
export async function captureIntent(
  input: CaptureIntentInput,
): Promise<string> {
  return appendEntry({
    ...input,
    outcome: "ADAPTER_FAILURE",
    detail: {
      ...(input.detail ?? {}),
      captureStage: "INTENT",
      note: "Charge attempted. This entry is closed with the network result.",
    },
  });
}

export interface CloseIntentInput {
  entryId: string;
  outcome:
    | "EXECUTED"
    | "APPROVED_AND_EXECUTED"
    | "NETWORK_DECLINE"
    | "ADAPTER_FAILURE";
  pravaChargeId?: string | null;
  pravaSessionId?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * Close a captured intent with the network's answer.
 *
 * This is the one place in the codebase that updates a ledger row, and it
 * updates only the fields that were unknowable when the row was written — the
 * outcome and the network's identifiers. Attribution, amount, decision, and
 * cited rule are all written at capture time and are never rewritten. Closing a
 * row that was already closed is refused.
 */
export async function closeIntent(input: CloseIntentInput): Promise<void> {
  const existing = await prisma.ledgerEntry.findUnique({
    where: { id: input.entryId },
    select: { outcome: true, detail: true },
  });

  if (!existing) {
    throw new Error(`No ledger entry ${input.entryId} to close.`);
  }

  const stage = (existing.detail as { captureStage?: string } | null)
    ?.captureStage;
  if (stage !== "INTENT") {
    throw new Error(
      `Ledger entry ${input.entryId} is not an open intent and cannot be closed.`,
    );
  }

  await prisma.ledgerEntry.update({
    where: { id: input.entryId },
    data: {
      outcome: input.outcome,
      pravaChargeId: input.pravaChargeId ?? null,
      pravaSessionId: input.pravaSessionId ?? null,
      detail: {
        ...(existing.detail as Record<string, unknown>),
        ...(input.detail ?? {}),
        captureStage: "CLOSED",
      },
    },
  });
}

/**
 * Intents that were never closed. A non-empty result means a charge was
 * attempted and its outcome is unknown — surfaced, never swept up.
 */
export async function findOpenIntents(): Promise<
  { id: string; vendorId: string; amountCents: number | null }[]
> {
  const rows = await prisma.ledgerEntry.findMany({
    where: {
      outcome: "ADAPTER_FAILURE",
      detail: { path: ["captureStage"], equals: "INTENT" },
    },
    select: { id: true, vendorId: true, amountCents: true },
  });
  return rows;
}
