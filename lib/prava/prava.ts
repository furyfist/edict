import type { Cents, MandateStatus } from "../contracts";
import {
  centsToDecimal,
  decimalToCents,
  isPravaConfigured,
  pravaRequest,
} from "./http";
import type {
  ChargeRequest,
  ChargeResult,
  MandateSnapshot,
  PaymentBoundary,
  PaymentFailure,
} from "./types";

/**
 * The real Prava adapter. The only code in this system that moves money.
 *
 * Slots in behind the mock's interface — nothing above it notices the swap.
 *
 * ---------------------------------------------------------------------------
 * THE DECLINE THAT MATTERS
 *
 * An over-cap charge does not come back as an API error. It comes back as HTTP
 * 200 with `status: "failed"` and `errorCode: THRESHOLD_EXCEEDED` in the body —
 * because it is not a Prava rejection, it is a **Visa decline**. The ceiling is
 * enforced in the tokenized credential, outside this application entirely.
 *
 * That distinction is the product. Handle it as a declined transaction, never
 * as a transport failure, and never retry it.
 * ---------------------------------------------------------------------------
 *
 * A charge returns `awaiting_result` and is not complete until it is reported.
 * See `report()` below.
 */

interface ChargeBody {
  mandateId?: string;
  transactionId?: string;
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  credentials?: Record<string, unknown>;
}

interface MandateBody {
  id?: string;
  status?: string;
  approvedAmount?: string;
  remaining?: string;
  spent?: string;
  chargeCount?: number;
  validUntil?: string | null;
}

function toStatus(raw: string | undefined): MandateStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "active":
      return "ACTIVE";
    case "paused":
      return "PAUSED";
    case "consumed":
      return "CONSUMED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "expired":
      return "EXPIRED";
    default:
      return "PENDING";
  }
}

function toSnapshot(body: MandateBody, fallbackId: string): MandateSnapshot {
  const cap = decimalToCents(body.approvedAmount);
  return {
    mandateId: body.id ?? fallbackId,
    status: toStatus(body.status),
    capCents: cap,
    // `remaining` is documented as indicative for display. The authoritative
    // ceiling is the per-charge cap enforced by the network, so fall back to it
    // rather than to zero — treating a missing display value as "no headroom"
    // would refuse legitimate charges.
    remainingCents:
      body.remaining === undefined ? cap : decimalToCents(body.remaining),
    expiresAt: body.validUntil ?? null,
  };
}

/** Maps a failed charge body to a typed failure. */
function chargeFailure(body: ChargeBody | null, status: number): PaymentFailure {
  const code = (body?.errorCode ?? body?.errorMessage ?? "").toUpperCase();

  if (code.includes("THRESHOLD_EXCEEDED")) {
    return {
      kind: "DECLINED_OVER_CAP",
      code: "THRESHOLD_EXCEEDED",
      message:
        body?.errorMessage ??
        "Declined by the card network: the amount exceeds the authorized ceiling.",
      retryable: false,
    };
  }

  if (code.includes("MANDATE_NOT_ACTIVE")) {
    return {
      kind: "MANDATE_INACTIVE",
      code: "MANDATE_NOT_ACTIVE",
      message: body?.errorMessage ?? "The mandate is not active.",
      retryable: false,
    };
  }

  if (code.includes("MANDATE_NOT_FOUND") || status === 404) {
    return {
      kind: "MANDATE_NOT_FOUND",
      code: "MANDATE_NOT_FOUND",
      message: body?.errorMessage ?? "No such mandate.",
      retryable: false,
    };
  }

  if (code.includes("MERCHANT_NOT_ALLOWED")) {
    return {
      kind: "MANDATE_INACTIVE",
      code: "MANDATE_MERCHANT_NOT_ALLOWED",
      message:
        body?.errorMessage ?? "This merchant is outside the mandate's scope.",
      retryable: false,
    };
  }

  // 5xx and network-level problems are the only retryable class. Everything
  // else is a decision someone made, and repeating the request will not change
  // it — it will only risk charging twice.
  const retryable = status === 0 || status >= 500;
  return {
    kind: retryable ? "TRANSIENT" : "UNKNOWN",
    code: body?.errorCode ?? `http_${status}`,
    message: body?.errorMessage ?? `Charge failed with status ${status}.`,
    retryable,
  };
}

/**
 * Settles a charge with the card network.
 *
 * A renewal here is not driven through a merchant checkout — the mandate is the
 * instrument and the vendor bills against it — so the outcome we report is the
 * outcome of the charge itself. Reporting is what completes the transaction;
 * an unreported charge stays `awaiting_result`.
 */
async function report(input: {
  mandateId: string;
  transactionId: string;
  approved: boolean;
  amountCents: Cents;
}): Promise<void> {
  await pravaRequest({
    method: "POST",
    path: `/v1/mandates/${encodeURIComponent(input.mandateId)}/charges/${encodeURIComponent(input.transactionId)}/report`,
    body: {
      txn_status: input.approved ? "APPROVED" : "DECLINED",
      txn_type: "PURCHASE",
      amount_paid: centsToDecimal(input.amountCents),
    },
  });
}

async function lifecycle(
  mandateId: string,
  action: "pause" | "resume" | "cancel",
): Promise<MandateSnapshot | null> {
  const response = await pravaRequest<MandateBody>({
    method: "POST",
    path: `/v1/mandates/${encodeURIComponent(mandateId)}/${action}`,
  });

  if (!response.ok || !response.body) return null;
  return toSnapshot(response.body, mandateId);
}

export function createPravaAdapter(): PaymentBoundary {
  return {
    name: "prava",

    async health() {
      return isPravaConfigured();
    },

    async getMandate(mandateId) {
      const response = await pravaRequest<MandateBody>({
        method: "GET",
        path: `/v1/mandates/${encodeURIComponent(mandateId)}`,
      });
      if (!response.ok || !response.body) return null;
      return toSnapshot(response.body, mandateId);
    },

    pauseMandate: (id) => lifecycle(id, "pause"),
    resumeMandate: (id) => lifecycle(id, "resume"),
    cancelMandate: (id) => lifecycle(id, "cancel"),

    async charge(request: ChargeRequest): Promise<ChargeResult> {
      const response = await pravaRequest<ChargeBody>({
        method: "POST",
        path: `/v1/mandates/${encodeURIComponent(request.mandateId)}/charge`,
        idempotencyKey: request.idempotencyKey,
        body: {
          amount: centsToDecimal(request.amountCents),
          reference: request.idempotencyKey.slice(0, 255),
        },
      });

      if (response.transportError) {
        return {
          ok: false,
          mandateId: request.mandateId,
          failure: {
            kind: "TRANSIENT",
            code: "transport_error",
            message: response.transportError,
            retryable: true,
          },
        };
      }

      const body = response.body;

      // A declined charge is HTTP 200 with status "failed". This is the
      // over-cap path and it must never be treated as an outage.
      if (!response.ok || !body || body.status === "failed") {
        return {
          ok: false,
          mandateId: request.mandateId,
          failure: chargeFailure(body, response.status),
        };
      }

      const transactionId = body.transactionId;
      if (!transactionId) {
        return {
          ok: false,
          mandateId: request.mandateId,
          failure: {
            kind: "UNKNOWN",
            code: "missing_transaction_id",
            message: "Charge succeeded but returned no transaction id.",
            retryable: false,
          },
        };
      }

      // Settle it. Failure to report leaves the charge awaiting_result rather
      // than undoing it, so this is deliberately not fatal — the ledger entry
      // is still written and the identifiers are still recorded.
      await report({
        mandateId: request.mandateId,
        transactionId,
        approved: true,
        amountCents: request.amountCents,
      });

      return {
        ok: true,
        mandateId: body.mandateId ?? request.mandateId,
        chargeId: transactionId,
        status: body.status ?? "succeeded",
      };
    },
  };
}

export { centsToDecimal, decimalToCents, isPravaConfigured } from "./http";
