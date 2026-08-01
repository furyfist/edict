import { cents } from "../contracts/money";
import { isChargeable } from "../contracts";
import type { Cents, MandateStatus } from "../contracts";
import type {
  ChargeHistoryResult,
  ChargeRecord,
  ChargeRequest,
  ChargeResult,
  MandateSnapshot,
  MandateStore,
  PaymentBoundary,
} from "./types";

/**
 * Mock payment boundary.
 *
 * Simulates the behavior the real adapter is expected to exhibit, so the whole
 * pipeline can be built and proven correct before Prava is introduced. It stays
 * in the repository through the demo as a live fallback — it costs nothing to
 * keep and it is the thing that saves the run if the sandbox misbehaves.
 *
 * The over-cap decline it models is the behavior being verified in
 * docs/spikes/prava-decline.md. If that spike comes back negative, this mock is
 * still correct about OUR side of the contract; only the real adapter changes.
 */

export interface MockOptions {
  store: MandateStore;
  /**
   * Forces the next charge to fail. Used to prove that a charge failing
   * mid-flight still produces a recorded outcome.
   */
  failMode?: "TRANSIENT" | "UNKNOWN" | null;
}

export function createMockAdapter(options: MockOptions): PaymentBoundary {
  const { store } = options;
  let failMode = options.failMode ?? null;
  let counter = 0;

  return {
    name: "mock",

    async health() {
      return true;
    },

    async getMandate(mandateId) {
      return store.get(mandateId);
    },

    async pauseMandate(mandateId) {
      return store.setStatus(mandateId, "PAUSED");
    },

    async resumeMandate(mandateId) {
      return store.setStatus(mandateId, "ACTIVE");
    },

    async cancelMandate(mandateId) {
      return store.setStatus(mandateId, "CANCELLED");
    },

    async charge(request: ChargeRequest): Promise<ChargeResult> {
      if (failMode) {
        const kind = failMode;
        failMode = null;
        return {
          ok: false,
          mandateId: request.mandateId,
          failure: {
            kind,
            code: kind === "TRANSIENT" ? "network_error" : "unknown_error",
            message:
              kind === "TRANSIENT"
                ? "Simulated transient failure reaching the payment provider."
                : "Simulated unknown failure.",
            retryable: kind === "TRANSIENT",
          },
        };
      }

      const mandate = await store.get(request.mandateId);

      if (!mandate) {
        return {
          ok: false,
          mandateId: request.mandateId,
          failure: {
            kind: "MANDATE_NOT_FOUND",
            code: "mandate_not_found",
            message: `No mandate ${request.mandateId}.`,
            retryable: false,
          },
        };
      }

      if (!isChargeable(mandate.status)) {
        return {
          ok: false,
          mandateId: request.mandateId,
          failure: {
            kind: "MANDATE_INACTIVE",
            code: "mandate_inactive",
            message: `Mandate is ${mandate.status.toLowerCase()} and cannot be charged.`,
            retryable: false,
          },
        };
      }

      // The ceiling. In production this is enforced in the tokenized credential
      // by the card network, not by application code — which is precisely why
      // a compromised agent still cannot overspend.
      if (request.amountCents > mandate.remainingCents) {
        return {
          ok: false,
          mandateId: request.mandateId,
          failure: {
            kind: "DECLINED_OVER_CAP",
            code: "declined_over_cap",
            message: `Declined: ${request.amountCents} exceeds the authorized ceiling of ${mandate.remainingCents}.`,
            retryable: false,
          },
        };
      }

      await store.consume(request.mandateId, request.amountCents);
      counter += 1;

      const chargeId = `mock_charge_${request.idempotencyKey}_${counter}`;

      // The mock's own book. Written by the ADAPTER, not by the caller, and
      // deliberately not by lib/ledger — that separation is the entire point of
      // reconciliation. If a charge succeeds here and the ledger write is
      // suppressed, this record survives to accuse us.
      await store.recordCharge({
        chargeId,
        mandateId: request.mandateId,
        amountCents: request.amountCents,
        currency: request.currency,
        status: "succeeded",
        createdAt: new Date().toISOString(),
        reference: request.idempotencyKey,
      });

      return {
        ok: true,
        mandateId: request.mandateId,
        chargeId,
        status: "succeeded",
      };
    },

    async listCharges(mandateId): Promise<ChargeHistoryResult> {
      // Both reads at once. The existence check and the history are independent
      // questions, and asking them in sequence doubled the depth of every
      // reconciliation.
      const [mandate, charges] = await Promise.all([
        store.get(mandateId),
        store.charges(mandateId),
      ]);

      if (!mandate) {
        return {
          ok: false,
          reason: "MANDATE_NOT_FOUND",
          message: `No mandate ${mandateId}.`,
        };
      }
      return { ok: true, charges };
    },
  };
}

/** In-memory store for tests. Deterministic and DB-free. */
export function inMemoryMandateStore(
  seed: MandateSnapshot[] = [],
): MandateStore {
  const map = new Map<string, MandateSnapshot>(
    seed.map((mandate) => [mandate.mandateId, { ...mandate }]),
  );
  const charges: ChargeRecord[] = [];

  return {
    async recordCharge(charge: ChargeRecord) {
      charges.push({ ...charge });
    },
    async charges(mandateId: string) {
      return charges
        .filter((charge) => charge.mandateId === mandateId)
        .map((charge) => ({ ...charge }));
    },
    async get(mandateId) {
      const found = map.get(mandateId);
      return found ? { ...found } : null;
    },
    async setStatus(mandateId: string, status: MandateStatus) {
      const found = map.get(mandateId);
      if (!found) return null;
      const next = { ...found, status };
      map.set(mandateId, next);
      return { ...next };
    },
    async consume(mandateId: string, amountCents: Cents) {
      const found = map.get(mandateId);
      if (!found) return;
      map.set(mandateId, {
        ...found,
        remainingCents: cents(Math.max(0, found.remainingCents - amountCents)),
      });
    },
  };
}
