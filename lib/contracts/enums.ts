/**
 * Closed sets used across the system.
 *
 * Declared as const objects rather than TS enums so they survive
 * `isolatedModules` and can be iterated for validation.
 */

/** The only actions the agent may propose. Anything else is malformed. */
export const ACTIONS = [
  "RENEW_AS_IS",
  "RENEW_REDUCED",
  "PAUSE",
  "CANCEL",
  "ESCALATE",
] as const;
export type Action = (typeof ACTIONS)[number];

/** What a policy rule does when it matches. */
export const EFFECTS = ["ALLOW_AUTO", "REQUIRE_APPROVAL", "DENY"] as const;
export type Effect = (typeof EFFECTS)[number];

/** Terminal state of one adjudication. */
export const OUTCOMES = [
  "EXECUTED",
  "ESCALATED",
  "REFUSED",
  "FAILED",
  "HALTED",
] as const;
export type Outcome = (typeof OUTCOMES)[number];

/** Why something was refused. Every refusal carries exactly one. */
export const REFUSAL_CODES = [
  "POLICY_DENIED",
  "MALFORMED_PROPOSAL",
  "INVALID_ACTION",
  "NETWORK_DECLINE",
  "MANDATE_INACTIVE",
  "OUTSIDE_AUTHORITY",
  "UNSUPPORTED_CURRENCY",
  "APPROVAL_REJECTED",
  "APPROVAL_EXPIRED",
] as const;
export type RefusalCode = (typeof REFUSAL_CODES)[number];

/** Why a tick declined to run. A halt is always visible, never silent. */
export const HALT_REASONS = [
  "KILL_SWITCH",
  "NO_POLICY",
  "AGENT_UNAVAILABLE",
  "ADAPTER_UNAVAILABLE",
  "LOCK_HELD",
] as const;
export type HaltReason = (typeof HALT_REASONS)[number];

/** Mirrors Prava's mandate lifecycle. Prava owns the truth; we cache it. */
export const MANDATE_STATUSES = [
  "PENDING",
  "ACTIVE",
  "PAUSED",
  "CONSUMED",
  "CANCELLED",
  "EXPIRED",
] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

/** Only ACTIVE mandates can be charged. */
export function isChargeable(status: MandateStatus): boolean {
  return status === "ACTIVE";
}

export const FREQUENCIES = ["ONE_TIME", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

/**
 * Two approval types that are never interchangeable.
 *
 * POLICY_EXCEPTION — within existing mandate authority. Approved in-app.
 *                    Grants permission for one charge and nothing further.
 * CEILING_RAISE    — exceeds mandate authority. Requires a fresh passkey
 *                    ceremony through Prava. There is no override path.
 */
export const APPROVAL_TYPES = ["POLICY_EXCEPTION", "CEILING_RAISE"] as const;
export type ApprovalType = (typeof APPROVAL_TYPES)[number];

export const APPROVAL_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "EXPIRED",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** How the engine reached its verdict. Drives the explanation template. */
export const VERDICT_CODES = [
  "RULE_MATCHED",
  "NO_RULE_MATCHED",
  "EVIDENCE_INCOMPLETE",
  "MALFORMED_PROPOSAL",
  "OVER_MANDATE_CEILING",
  "MANDATE_NOT_CHARGEABLE",
  "NO_MANDATE",
  "UNSUPPORTED_CURRENCY",
] as const;
export type VerdictCode = (typeof VERDICT_CODES)[number];

export function isAction(value: unknown): value is Action {
  return typeof value === "string" && (ACTIONS as readonly string[]).includes(value);
}

export function isEffect(value: unknown): value is Effect {
  return typeof value === "string" && (EFFECTS as readonly string[]).includes(value);
}
