import { describe, expect, it } from "vitest";
import { isRetryable, TERMINAL_FAILURES } from "./types";
import type { ChargeFailure, ChargeFailureKind } from "./types";

/**
 * The retry rule at the payment boundary.
 *
 * A decline is an answer: the network considered the charge and refused it.
 * Retrying an answer is asking a settled question again, and on a payment
 * network it is how one refused charge becomes two attempted ones. A timeout
 * is the absence of an answer, and that is worth asking again — exactly once.
 *
 * This distinction is the difference between "the network said no" and "we did
 * not hear back", and getting it wrong is the kind of bug that only shows up
 * with real money.
 */

function failure(kind: ChargeFailureKind): ChargeFailure {
  return {
    ok: false,
    kind,
    networkMessage: "test",
    chargeId: null,
    sessionId: null,
  };
}

describe("declines are never retried", () => {
  it("every terminal failure is non-retryable", () => {
    for (const kind of TERMINAL_FAILURES) {
      expect(isRetryable(failure(kind))).toBe(false);
    }
  });

  it("an over-cap decline is terminal", () => {
    expect(isRetryable(failure("DECLINED"))).toBe(false);
  });

  it("a paused mandate is terminal — the fallback climax behaves the same", () => {
    expect(isRetryable(failure("MANDATE_PAUSED"))).toBe(false);
  });
});

describe("the absence of an answer is retried", () => {
  it("a timeout is retryable", () => {
    expect(isRetryable(failure("TIMEOUT"))).toBe(true);
  });

  it("an unreachable host is retryable", () => {
    expect(isRetryable(failure("UNREACHABLE"))).toBe(true);
  });

  it("a malformed response is retryable", () => {
    expect(isRetryable(failure("MALFORMED_RESPONSE"))).toBe(true);
  });
});
