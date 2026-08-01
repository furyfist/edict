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
  // The live adapter lands in M3. Until then, and whenever PRAVA_MODE is not
  // explicitly "live", the mock is what runs.
  cached = new MockPravaAdapter();
  return cached;
}

/** Test seam. Not used by application code. */
export function __resetAdapter(): void {
  cached = null;
}

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
