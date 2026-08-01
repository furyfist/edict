import type { Cents, Currency } from "../contracts";

/**
 * The payment boundary.
 *
 * This interface is written before either implementation. The mock satisfies it
 * in M1 and the real adapter satisfies it in M3, which means the swap is one
 * module behind an unchanged signature and a failure after the swap has exactly
 * one suspect.
 *
 * Everything in this file is about one property: exactly one module can move
 * money, and every way it can fail is a value rather than an exception. A
 * thrown error at the payment boundary is a decision made by whoever wrote the
 * catch block; a typed result is a decision made here, once.
 */

export type MandateStatus = "ACTIVE" | "PAUSED" | "CANCELLED" | "EXPIRED";

export interface Mandate {
  /** Prava's identifier. The thing a judge cross-checks in Prava's dashboard. */
  mandateId: string;
  status: MandateStatus;
  /** Enforced in the tokenized credential itself, not by us. */
  amountCeilingCents: Cents;
  spentCents: Cents;
  currency: Currency;
  merchantId: string | null;
  expiresAt: string | null;
}

export interface ChargeRequest {
  mandateId: string;
  amountCents: Cents;
  currency: Currency;
  /** Scopes the charge to one renewal cycle. Replays return the same charge. */
  idempotencyKey: string;
  description: string;
}

export interface ChargeSuccess {
  ok: true;
  chargeId: string;
  sessionId: string;
  amountCents: Cents;
  currency: Currency;
}

/**
 * Why a charge did not happen.
 *
 * The distinction that matters operationally is between DECLINED and the rest.
 * A decline is an answer — the network considered the charge and refused it —
 * and answers are never retried. A timeout or an unreachable host is the
 * absence of an answer, and those retry exactly once.
 */
export const CHARGE_FAILURE_KINDS = [
  "DECLINED",
  "MANDATE_PAUSED",
  "MANDATE_NOT_FOUND",
  "MANDATE_EXPIRED",
  "TIMEOUT",
  "UNREACHABLE",
  "MALFORMED_RESPONSE",
] as const;
export type ChargeFailureKind = (typeof CHARGE_FAILURE_KINDS)[number];

/** Failures that are answers. Retrying one is asking a settled question again. */
export const TERMINAL_FAILURES: readonly ChargeFailureKind[] = [
  "DECLINED",
  "MANDATE_PAUSED",
  "MANDATE_NOT_FOUND",
  "MANDATE_EXPIRED",
];

export interface ChargeFailure {
  ok: false;
  kind: ChargeFailureKind;
  /** The network's own words, carried through to the ledger unedited. */
  networkMessage: string;
  /** Present when the network issued an id before refusing. */
  chargeId: string | null;
  sessionId: string | null;
}

export type ChargeResult = ChargeSuccess | ChargeFailure;

export function isRetryable(failure: ChargeFailure): boolean {
  return !TERMINAL_FAILURES.includes(failure.kind);
}

export interface MandateResult {
  ok: boolean;
  mandate: Mandate | null;
  error: string | null;
}

export interface CreateMandateRequest {
  vendorId: string;
  merchantId: string | null;
  amountCeilingCents: Cents;
  currency: Currency;
  expiresAt: string | null;
  /** Set when the mandate originates in a passkey ceremony. */
  passkeyCeremonyId?: string;
}

export interface HealthResult {
  healthy: boolean;
  detail: string;
}

/**
 * The payment adapter. Exactly one implementation is live at a time, and
 * exactly one caller invokes it: the outcome router.
 */
export interface PravaAdapter {
  readonly mode: "mock" | "live";

  charge(request: ChargeRequest): Promise<ChargeResult>;

  createMandate(request: CreateMandateRequest): Promise<MandateResult>;
  getMandate(mandateId: string): Promise<MandateResult>;
  pauseMandate(mandateId: string): Promise<MandateResult>;
  resumeMandate(mandateId: string): Promise<MandateResult>;
  cancelMandate(mandateId: string): Promise<MandateResult>;
  listMandates(): Promise<Mandate[]>;

  /** Checked before a tick adjudicates anything. Unhealthy is a halt. */
  health(): Promise<HealthResult>;
}
