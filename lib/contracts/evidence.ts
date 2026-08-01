import type { BillingCadence, IsoTimestamp, Money } from "./common";

/**
 * Contract 1 — the evidence bundle.
 *
 * A frozen snapshot of everything known about one pending renewal at one
 * instant. Both the agent and the policy engine read this same bundle: the
 * agent to form a proposal, the engine to adjudicate one. That they read
 * identical facts is what makes the adjudication meaningful — the engine is
 * not taking the agent's word for anything.
 *
 * A bundle is assembled once per renewal per tick and never mutated.
 */

export interface SeatUsage {
  /** Seats the vendor is billing for. */
  licensed: number;
  /** Seats with any activity in the observation window. */
  active: number;
  /** Seats with no activity for the whole window. */
  dormant: number;
  /** Days of activity the counts are derived from. */
  windowDays: number;
}

export interface PriceChange {
  previous: Money;
  current: Money;
  /** Basis points, integer. 1500 = a 15% increase. Negative is a decrease. */
  deltaBasisPoints: number;
}

/** A message attributed to the vendor. Untrusted input by construction. */
export interface VendorMessage {
  id: string;
  receivedAt: IsoTimestamp;
  subject: string;
  body: string;
  /**
   * Whether this message arrived through the attack console. Recorded so a
   * ledger entry can show that a refusal was triggered by injected content.
   */
  injected: boolean;
}

/**
 * Named gaps in the bundle. The engine reads these directly: a missing fact is
 * an input to adjudication, not an exception. Invariant 6 lives here.
 */
export const EVIDENCE_GAPS = [
  "NO_USAGE_DATA",
  "NO_PRIOR_INVOICE",
  "NO_CONTRACT_TERMS",
  "STALE_USAGE_DATA",
  "UNKNOWN_VENDOR",
] as const;
export type EvidenceGap = (typeof EVIDENCE_GAPS)[number];

export interface EvidenceBundle {
  /** Stable id; a proposal and a verdict both cite it. */
  bundleId: string;
  /** Demo-clock instant this snapshot was taken. Never wall time. */
  observedAt: IsoTimestamp;

  vendor: {
    id: string;
    name: string;
    category: string;
    /** Vendor-side identifier used for the payment merchant pin. */
    merchantId: string | null;
  };

  renewal: {
    id: string;
    dueAt: IsoTimestamp;
    amount: Money;
    cadence: BillingCadence;
    /** Billing cycle key. Idempotency is scoped to renewal + cycle. */
    cycleKey: string;
  };

  seats: SeatUsage | null;
  priceChange: PriceChange | null;
  /** Amount charged for the equivalent prior cycle, if one is known. */
  priorCycleAmount: Money | null;
  /** Messages attributed to the vendor within the observation window. */
  messages: VendorMessage[];

  /** Named absences. Empty means the bundle is complete. */
  gaps: EvidenceGap[];
}

export function hasGap(bundle: EvidenceBundle, gap: EvidenceGap): boolean {
  return bundle.gaps.includes(gap);
}
