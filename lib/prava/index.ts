import { createMockAdapter } from "./mock";
import { createPravaAdapter } from "./prava";
import { isPravaConfigured } from "./http";
import { dbMandateStore } from "./store";
import type { PaymentBoundary } from "./types";

/**
 * The single payment boundary.
 *
 * Real Prava when a secret key is present, the mock otherwise. Falling back
 * rather than throwing keeps the full pipeline runnable in an unconfigured
 * environment, and on demo day a sandbox outage degrades to a working system
 * instead of a dead one.
 *
 * Which one ran is recorded on every executed ledger entry via
 * `executedBy.provider`, so the fallback is never invisible.
 */

let adapter: PaymentBoundary | null = null;

export function paymentBoundary(): PaymentBoundary {
  if (!adapter) {
    adapter = isPravaConfigured()
      ? createPravaAdapter()
      : createMockAdapter({ store: dbMandateStore });
  }
  return adapter;
}

/** Test seam, and the demo-day escape hatch back to the mock. */
export function __setPaymentBoundary(next: PaymentBoundary | null) {
  adapter = next;
}

export { createMockAdapter, inMemoryMandateStore } from "./mock";
export { createPravaAdapter } from "./prava";
export { dbMandateStore } from "./store";
export {
  centsToDecimal,
  decimalToCents,
  isPravaConfigured,
  apiBase,
} from "./http";
export type {
  ChargeHistoryFailure,
  ChargeHistoryResult,
  ChargeRecord,
  ChargeRequest,
  ChargeResult,
  MandateSnapshot,
  MandateStore,
  PaymentBoundary,
  PaymentFailure,
} from "./types";
