/**
 * Money is always an integer number of cents. Never a float.
 *
 * Floating-point money is a bug waiting for the worst possible moment, so the
 * branded type makes an unchecked number impossible to pass where money is
 * expected. Currency is USD only — see CURRENCY below.
 */

export type Cents = number & { readonly __brand: "Cents" };

/** The only currency this system handles. Anything else is refused. */
export const CURRENCY = "USD" as const;
export type Currency = typeof CURRENCY;

export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Throws on non-integer or negative input. Callers must validate before this. */
export function cents(value: number): Cents {
  if (!Number.isInteger(value)) {
    throw new Error(`Money must be an integer number of cents, got ${value}`);
  }
  if (value < 0) {
    throw new Error(`Money must not be negative, got ${value}`);
  }
  return value as Cents;
}

/** Display only. Never use the result for arithmetic. */
export function formatCents(value: Cents): string {
  return `$${(value / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
