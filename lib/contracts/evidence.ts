import type { Cents, Currency } from "./money";
import type { Frequency, MandateStatus } from "./enums";

/**
 * CONTRACT 1 — EvidenceBundle
 *
 * The factual basis for one renewal decision, assembled from database facts and
 * the demo clock. Both the agent and the policy engine read this same frozen
 * snapshot, and a copy is embedded in the ledger entry.
 *
 * Two rules govern this shape:
 *
 *  1. The engine reads facts from HERE, never from the agent's proposal. The
 *     model may assert usage is 95%; the engine reads 50% from the bundle and
 *     rules accordingly. This is what defeats prompt injection.
 *
 *  2. Absent data is `null` and is declared in `completeness`. It is never
 *     defaulted to zero, because zero is a fact and absence is not. Unknown is
 *     never permission.
 */

export interface SeatDetail {
  seatId: string;
  email: string;
  /** null when the seat has never logged in or login data is unavailable. */
  lastLoginDaysAgo: number | null;
}

export interface SeatEvidence {
  assigned: number;
  /** Seats with any login in the trailing 30 days. null when unavailable. */
  activeTrailing30d: number | null;
  /** Convenience derivation. null whenever activeTrailing30d is null. */
  activePct: number | null;
  detail: SeatDetail[];
}

export interface RenewalEvidence {
  amountCents: Cents;
  currency: Currency;
  frequency: Frequency;
  /** ISO date. */
  dueDate: string;
  /** Relative to the demo clock, not wall time. Negative when overdue. */
  daysUntilDue: number;
}

export interface PricePoint {
  /** ISO date of the cycle this amount was charged for. */
  cycleStart: string;
  amountCents: Cents;
}

export interface MandateEvidence {
  /** null when this vendor has no mandate — spend outside the agent's authority. */
  mandateId: string | null;
  status: MandateStatus | null;
  /** Per-charge ceiling. Enforced in the tokenized credential, not by us. */
  capCents: Cents | null;
  remainingCents: Cents | null;
  /** ISO datetime. */
  expiresAt: string | null;
}

/**
 * Untrusted input. Vendor-authored text that reaches the agent's context.
 *
 * This is the prompt-injection surface and it is deliberately part of the
 * contract: the attack is a first-class scenario, not an edge case.
 */
export interface InboundMessage {
  id: string;
  /** ISO datetime on the demo clock. */
  receivedAt: string;
  from: string;
  subject: string;
  body: string;
  /** True for messages planted through the attack console. */
  injected: boolean;
}

/**
 * Explicit declaration of what is known. The engine consults this before
 * anything else and fails closed on any false.
 */
export interface EvidenceCompleteness {
  hasUsageData: boolean;
  hasPriceHistory: boolean;
  hasMandate: boolean;
}

export interface EvidenceBundle {
  bundleId: string;
  /** ISO datetime read from the demo clock. Never wall time. */
  asOf: string;

  vendorId: string;
  vendorName: string;
  category: string;

  renewalId: string;
  /** ISO date identifying the billing cycle. Half of the idempotency key. */
  cycleStart: string;

  seats: SeatEvidence;
  renewal: RenewalEvidence;
  /** Ordered oldest to newest. Empty when no history exists. */
  priceHistory: PricePoint[];
  mandate: MandateEvidence;
  inboundMessages: InboundMessage[];

  completeness: EvidenceCompleteness;
}

/** True when every completeness flag is set. Used by the engine to fail closed. */
export function isEvidenceComplete(bundle: EvidenceBundle): boolean {
  const { hasUsageData, hasPriceHistory, hasMandate } = bundle.completeness;
  return hasUsageData && hasPriceHistory && hasMandate;
}
