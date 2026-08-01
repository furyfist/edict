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

/**
 * One charge as the NETWORK reports it — the second book.
 *
 * Deliberately not shaped like a ledger entry. This is the counterparty's
 * record, and reconciliation is only meaningful because the two shapes are
 * independent: if this were derived from our own entry it would agree with us
 * by construction and prove nothing.
 */
export interface ChargeRecord {
  chargeId: string;
  mandateId: string;
  amountCents: Cents;
  currency: Currency;
  /** As reported by the network. Not normalized to our enums on purpose. */
  status: string;
  /** ISO datetime, when the network reports one. */
  createdAt: string | null;
  /**
   * Our idempotency key, echoed back. `charge()` already sends it as
   * `reference`, which means the network-side record carries our join key
   * without any change to how money moves.
   */
  reference: string | null;
}

/**
 * Why a history read produced nothing.
 *
 * UNSUPPORTED and UNAVAILABLE are different facts and collapsing them would be
 * the same mistake the evidence bundle refuses to make with zero and unknown.
 * "This provider has no history endpoint" is a permanent property of the
 * integration; "the request failed" is a Tuesday.
 *
 * Neither may ever be rendered as "no charges". An empty list is a claim that
 * nothing was charged, and we are not entitled to make it.
 */
export type ChargeHistoryFailure = "UNSUPPORTED" | "UNAVAILABLE" | "MANDATE_NOT_FOUND";

export type ChargeHistoryResult =
  | { ok: true; charges: ChargeRecord[] }
  | { ok: false; reason: ChargeHistoryFailure; message: string };

export interface PaymentBoundary {
  /** The only method that moves money. */
  charge(request: ChargeRequest): Promise<ChargeResult>;

  /**
   * The independent second book, for reconciliation.
   *
   * A READ. It moves no money and it is the reason `lib/reconcile` does not
   * become a second payment boundary — the reconciler consumes this, so
   * invariant 3 holds: exactly one module talks to Prava.
   */
  listCharges(mandateId: string): Promise<ChargeHistoryResult>;

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
 *
 * The charge methods are what give the mock a second book of its own. Without
 * them the mock could only ever agree with our ledger, and a reconciliation
 * that cannot disagree is not a reconciliation.
 */
export interface MandateStore {
  get(mandateId: string): Promise<MandateSnapshot | null>;
  setStatus(mandateId: string, status: MandateStatus): Promise<MandateSnapshot | null>;
  consume(mandateId: string, amountCents: Cents): Promise<void>;

  recordCharge(charge: ChargeRecord): Promise<void>;
  charges(mandateId: string): Promise<ChargeRecord[]>;
}
