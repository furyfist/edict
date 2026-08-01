import type { Actor, IsoTimestamp, Money } from "./common";
import type { VerdictDecision, VerdictReason } from "./verdict";

/**
 * Contract 5 — the ledger entry.
 *
 * Append-only. There is no update shape and no delete shape in this file, and
 * that absence is the contract. A correction is a new entry carrying
 * `correctsEntryId`.
 *
 * Every entry names four separate actors: who decided, who authorized, who
 * executed, who recorded. That separation is the product.
 */

export const LEDGER_OUTCOMES = [
  "EXECUTED",
  "REFUSED",
  "ESCALATED",
  "APPROVED_AND_EXECUTED",
  "REJECTED_BY_HUMAN",
  "EXPIRED",
  "NETWORK_DECLINE",
  "HALTED",
  "ADAPTER_FAILURE",
] as const;
export type LedgerOutcome = (typeof LEDGER_OUTCOMES)[number];

/** Outcomes in which no money moved. Used by the refusal filter. */
export const REFUSAL_OUTCOMES: readonly LedgerOutcome[] = [
  "REFUSED",
  "ESCALATED",
  "REJECTED_BY_HUMAN",
  "EXPIRED",
  "NETWORK_DECLINE",
  "HALTED",
  "ADAPTER_FAILURE",
];

/** Identifiers issued by Prava. Present only when the network was reached. */
export interface PravaReferences {
  mandateId: string | null;
  chargeId: string | null;
  sessionId: string | null;
}

export interface LedgerEntry {
  id: string;
  /** Demo-clock instant. Monotonic within a tick. */
  recordedAt: IsoTimestamp;
  /** The tick that produced this entry. */
  tickId: string;

  vendorId: string;
  renewalId: string | null;
  /** Idempotency key: one entry per renewal per cycle. */
  cycleKey: string | null;

  outcome: LedgerOutcome;
  amount: Money | null;

  /* --- the four attributions. All four are always present. --- */
  decidedBy: Actor;
  authorizedBy: Actor;
  executedBy: Actor;
  recordedBy: Actor;

  /* --- the decision that produced this entry --- */
  decision: VerdictDecision | null;
  reason: VerdictReason | null;
  citedRuleId: string | null;
  citedSourceFragment: string | null;
  policyVersionId: string | null;

  /** Model prose, carried verbatim and rendered in a labeled region. */
  agentRationale: string | null;
  agentRejectedAlternative: string | null;

  prava: PravaReferences;

  /** Set when this entry corrects a prior one. Corrections never overwrite. */
  correctsEntryId: string | null;

  /** Structured payload the explainer templates over. Never free prose. */
  detail: Record<string, unknown>;
}

export function isRefusal(entry: LedgerEntry): boolean {
  return REFUSAL_OUTCOMES.includes(entry.outcome);
}
