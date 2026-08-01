import type { Cents, Currency, MandateStatus } from "../contracts";

/**
 * THE PAYMENT BOUNDARY.
 *
 * Exactly one module in this system can move money, and this interface is its
 * shape. It is written before either implementation — the mock in M1 and the
 * real Prava adapter in M3 both satisfy it, so the swap touches one file.
 *
 * Nothing else in the codebase talks to Prava. `lib/agent` cannot even import
 * this module: the separation is a fact about the dependency graph, not a
 * promise made in a prompt.
 */

export interface MandateSnapshot {
  mandateId: string;
  status: MandateStatus;
  /** Per-charge ceiling. Enforced in the tokenized credential, not by us. */
  capCents: Cents;
  remainingCents: Cents;
  expiresAt: string | null;
}

/**
 * A typed failure. `retryable` is the field that matters operationally:
 * transient errors get exactly one retry, declines get none. Retrying a decline
 * is how a demo charges twice.
 */
export interface PaymentFailure {
  kind:
    | "DECLINED_OVER_CAP"
    | "MANDATE_INACTIVE"
    | "MANDATE_NOT_FOUND"
    | "TRANSIENT"
    | "UNKNOWN";
  code: string;
  message: string;
  retryable: boolean;
}

export type ChargeResult =
  | { ok: true; chargeId: string; mandateId: string; status: string }
  | { ok: false; mandateId: string; failure: PaymentFailure };

export interface ChargeRequest {
  mandateId: string;
  amountCents: Cents;
  currency: Currency;
  /**
   * Derived from (renewalId, cycleStart). Prava detects duplicate transactions
   * within a session, and this makes our side idempotent too.
   */
  idempotencyKey: string;
}

export interface PaymentBoundary {
  /** The only method that moves money. */
  charge(request: ChargeRequest): Promise<ChargeResult>;

  getMandate(mandateId: string): Promise<MandateSnapshot | null>;
  pauseMandate(mandateId: string): Promise<MandateSnapshot | null>;
  resumeMandate(mandateId: string): Promise<MandateSnapshot | null>;
  cancelMandate(mandateId: string): Promise<MandateSnapshot | null>;

  /** Checked before a tick runs. A failing adapter halts rather than guesses. */
  health(): Promise<boolean>;

  /** Identifies which implementation is live. Surfaced in the ledger. */
  readonly name: "mock" | "prava";
}

/**
 * Storage seam for the mock. The real adapter has no equivalent — Prava is the
 * store. This exists so the mock can be driven from an in-memory map in tests
 * and from the mandate mirror at runtime.
 */
export interface MandateStore {
  get(mandateId: string): Promise<MandateSnapshot | null>;
  setStatus(mandateId: string, status: MandateStatus): Promise<MandateSnapshot | null>;
  consume(mandateId: string, amountCents: Cents): Promise<void>;
}
