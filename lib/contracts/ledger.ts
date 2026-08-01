import type { Cents, Currency } from "./money";
import type { Action, HaltReason, Outcome, RefusalCode } from "./enums";
import type { EvidenceBundle } from "./evidence";
import type { ProposalAlternative } from "./proposal";

/**
 * CONTRACT 5 — LedgerEntry
 *
 * The record of one adjudication. Append-only: no update path, no delete path.
 * A correction is a new entry pointing at the one it corrects.
 *
 * The four attribution fields are the point of this shape. They are separate
 * because the separation IS the security property — the decider is not the
 * authorizer, and a reader must be able to see that at a glance.
 */

/** Who decided. Always the agent, and never sufficient on its own. */
export interface DecidedBy {
  modelId: string;
  promptVersion: string;
  stubbed: boolean;
}

/**
 * Who permitted it. A policy version and one rule, plus a human when the action
 * required approval.
 *
 * `passkeyAt` is set only for CEILING_RAISE approvals. In-app approval satisfies
 * policy; it never creates authority.
 */
export interface AuthorizedBy {
  policyVersionId: string;
  policyVersion: number;
  ruleId: string;
  ruleOrdinal: number;
  /** The user's own words, rendered inline wherever this entry is shown. */
  sourceFragment: string;

  approverId: string | null;
  approvalId: string | null;
  /** ISO datetime of the passkey ceremony. Null for in-app approvals. */
  passkeyAt: string | null;
}

/** Who executed it. Only ever Prava, through the single payment boundary. */
export interface ExecutedBy {
  provider: "prava";
  mandateId: string;
  /** Null when the charge was attempted but not completed. */
  chargeId: string | null;
  status: string;
}

export interface FinancialImpact {
  /** What actually moved. Zero on anything other than EXECUTED. */
  chargedCents: Cents;
  /** What would have been paid had the agent done nothing. */
  counterfactualCents: Cents;
  /** counterfactual − charged. Negative is possible and is not an error. */
  savedCents: number;
}

export interface LedgerError {
  code: string;
  message: string;
}

/**
 * The receipt attached to an entry.
 *
 * NOT part of the signed record — a signature cannot cover itself. Everything
 * else on `LedgerEntry` is. See `toSignedRecord` in lib/ledger/record.ts.
 */
export interface LedgerReceipt {
  canonVersion: string;
  prevDigest: string;
  digest: string;
  signature: string | null;
  keyId: string | null;
}

export interface LedgerEntry {
  id: string;
  tickId: string;
  /** Wall clock. Operational only. */
  createdAt: string;
  /** Demo clock. This is the time the system believed it was. */
  clockAt: string;

  vendorId: string;
  vendorName: string;
  renewalId: string;
  cycleStart: string;

  proposedAction: Action;
  proposedAmountCents: Cents;

  outcome: Outcome;
  refusalCode: RefusalCode | null;
  haltReason: HaltReason | null;

  decidedBy: DecidedBy | null;
  authorizedBy: AuthorizedBy | null;
  executedBy: ExecutedBy | null;

  amountCents: Cents;
  currency: Currency;
  financialImpact: FinancialImpact;

  /** Frozen at decision time. Shows what was known then, not what is known now. */
  evidence: EvidenceBundle;

  /** Template-rendered from structured data. Never written by a model. */
  explanation: string;
  /** "Do nothing and you pay $X on <date>." Template-rendered. */
  counterfactual: string;
  alternative: ProposalAlternative | null;

  /**
   * The model's own words, kept in its own field so the interface can render it
   * in a separate labeled region. A reader must always be able to tell which
   * parts of the screen a language model wrote.
   */
  agentRationale: string | null;

  /** Set when this entry corrects an earlier one. The ledger is append-only. */
  correctsEntryId: string | null;
  error: LedgerError | null;

  /**
   * Null for entries written before receipts existed. Those render as
   * UNATTESTED — never as verified, and never as invalid.
   */
  receipt: LedgerReceipt | null;
}

/** Entries shown in the refusal view — what the agent would not do. */
export function isRefusal(entry: LedgerEntry): boolean {
  return entry.outcome === "REFUSED";
}

/** True when money actually moved. */
export function movedMoney(entry: LedgerEntry): boolean {
  return entry.outcome === "EXECUTED" && entry.financialImpact.chargedCents > 0;
}
