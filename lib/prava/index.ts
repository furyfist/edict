import { LivePravaAdapter } from "./live";
import { MockPravaAdapter } from "./mock";
import type { PravaAdapter } from "./types";

/**
 * The only module that can move money.
 *
 * One adapter is live at a time, selected by `PRAVA_MODE`. Both implementations
 * satisfy the same interface and both stay in the repository through the demo:
 * the mock is the fallback that runs when the sandbox is down, and it costs
 * nothing to keep.
 */

let cached: PravaAdapter | null = null;

export function getPravaAdapter(): PravaAdapter {
  if (cached) return cached;
  // Live only when explicitly asked for and credentialed. Anything else runs
  // the mock — a missing key falls back to the working fallback rather than
  // to a live adapter that will fail on every call.
  cached =
    process.env.PRAVA_MODE === "live" && process.env.PRAVA_API_KEY
      ? new LivePravaAdapter()
      : new MockPravaAdapter();
  return cached;
}

/** Test seam. Not used by application code. */
export function __resetAdapter(): void {
  cached = null;
}

export { LivePravaAdapter } from "./live";
export { MockPravaAdapter } from "./mock";
export {
  isRetryable,
  TERMINAL_FAILURES,
  type ChargeFailure,
  type ChargeFailureKind,
  type ChargeRequest,
  type ChargeResult,
  type ChargeSuccess,
  type CreateMandateRequest,
  type HealthResult,
  type Mandate,
  type MandateResult,
  type MandateStatus,
  type PravaAdapter,
} from "./types";
