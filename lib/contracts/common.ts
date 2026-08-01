/**
 * Shared primitives for the five frozen contracts.
 *
 * Money is always minor units (cents) as an integer. There is no floating
 * point anywhere in the money path — a rounding difference between what the
 * engine adjudicated and what the network charged would be indistinguishable
 * from a policy failure.
 */

/** An integer count of minor currency units. Never a float. */
export type Cents = number;

export type Currency = "USD";

export interface Money {
  cents: Cents;
  currency: Currency;
}

/**
 * Time is always an ISO 8601 string produced by the demo clock. No component
 * reads wall-clock time; this alias exists to make that grep-able.
 */
export type IsoTimestamp = string;

export const BILLING_CADENCES = ["MONTHLY", "ANNUAL", "QUARTERLY"] as const;
export type BillingCadence = (typeof BILLING_CADENCES)[number];

/**
 * The four actors every ledger entry names. The product's claim is that these
 * are separable, so they are separate fields rather than one "actor" string.
 */
export const ACTOR_ROLES = [
  "DECIDED_BY",
  "AUTHORIZED_BY",
  "EXECUTED_BY",
  "RECORDED_BY",
] as const;
export type ActorRole = (typeof ACTOR_ROLES)[number];

export interface Actor {
  /** Stable identifier: an agent version, a user id, or a system component. */
  id: string;
  /** Human-readable label rendered in the ledger. */
  label: string;
  kind: "AGENT" | "HUMAN" | "ENGINE" | "NETWORK" | "SYSTEM";
}

export function money(cents: Cents, currency: Currency = "USD"): Money {
  return { cents, currency };
}

export function formatMoney(m: Money): string {
  const sign = m.cents < 0 ? "-" : "";
  const abs = Math.abs(m.cents);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}$${whole.toLocaleString("en-US")}.${frac}`;
}
