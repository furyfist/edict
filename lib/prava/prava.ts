import type { Cents, MandateStatus } from "../contracts";
import {
  centsToDecimal,
  decimalToCents,
  isPravaConfigured,
  pravaRequest,
} from "./http";
import type {
  ChargeHistoryResult,
  ChargeRecord,
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

/**
 * CHARGE HISTORY — the second book, and the one unverified surface in this file.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS ACTUALLY PROBED, 2026-08-01
 *
 * The sandbox answers `GET /v1/mandates/{id}` with an APPLICATION 404
 * (`{"error":{"code":"MANDATE_NOT_FOUND"}}`) — the route exists. It answers
 * `GET /v1/mandates/{id}/charges` with a ROUTER 404
 * (`{"message":"Route GET:... not found","statusCode":404}`) — no such route.
 * Same for `/transactions`, `/history`, and the two collection-style paths.
 *
 * So a charge-history read is NOT confirmed to exist on this provider. The path
 * attempted below is the collection that the documented report endpoint
 * (`/v1/mandates/{id}/charges/{txnId}/report`) is nested under, which is the
 * only principled guess available. If Prava ships or documents a different one,
 * this function is the single place that changes.
 *
 * That is what the adapter is FOR. The unknown is isolated here, `lib/reconcile`
 * consumes a typed result, and the answer "this provider cannot be reconciled"
 * travels all the way to the interface as a distinct state rather than being
 * quietly rendered as balanced books.
 * ---------------------------------------------------------------------------
 */
interface ChargeListBody {
  charges?: unknown;
  data?: unknown;
  transactions?: unknown;
}

interface ChargeItemBody {
  id?: string;
  transactionId?: string;
  chargeId?: string;
  mandateId?: string;
  amount?: string | number;
  currency?: string;
  status?: string;
  createdAt?: string;
  created_at?: string;
  reference?: string;
}

function toChargeRecord(item: ChargeItemBody, mandateId: string): ChargeRecord | null {
  const chargeId = item.transactionId ?? item.chargeId ?? item.id;
  // A charge we cannot identify cannot be reconciled against anything. Dropping
  // it silently would understate the provider's book, so the caller is told the
  // read was partial by getting fewer records than the provider sent — which is
  // why this is logged rather than swallowed.
  if (!chargeId) {
    console.error("[prava] charge history item has no identifier; skipped");
    return null;
  }

  return {
    chargeId,
    mandateId: item.mandateId ?? mandateId,
    amountCents: decimalToCents(item.amount),
    currency: (item.currency ?? "USD").toUpperCase() === "USD" ? "USD" : "USD",
    status: item.status ?? "unknown",
    createdAt: item.createdAt ?? item.created_at ?? null,
    reference: item.reference ?? null,
  };
}

/** A Fastify router miss looks different from an application 404. */
function isRouteMissing(body: unknown): boolean {
  const message = (body as { message?: unknown } | null)?.message;
  return typeof message === "string" && message.startsWith("Route ");
}

async function listChargesFor(mandateId: string): Promise<ChargeHistoryResult> {
  const response = await pravaRequest<ChargeListBody>({
    method: "GET",
    path: `/v1/mandates/${encodeURIComponent(mandateId)}/charges`,
  });

  if (response.transportError) {
    return {
      ok: false,
      reason: "UNAVAILABLE",
      message: response.transportError,
    };
  }

  if (response.status === 404) {
    if (isRouteMissing(response.body)) {
      return {
        ok: false,
        reason: "UNSUPPORTED",
        message:
          "This Prava environment exposes no charge-history endpoint, so the " +
          "ledger cannot be reconciled against the network's own record.",
      };
    }
    return {
      ok: false,
      reason: "MANDATE_NOT_FOUND",
      message: `No mandate ${mandateId}.`,
    };
  }

  if (!response.ok || !response.body) {
    return {
      ok: false,
      reason: "UNAVAILABLE",
      message: `Charge history request failed with status ${response.status}.`,
    };
  }

  const body = response.body;
  const raw = Array.isArray(body)
    ? body
    : Array.isArray(body.charges)
      ? body.charges
      : Array.isArray(body.data)
        ? body.data
        : Array.isArray(body.transactions)
          ? body.transactions
          : null;

  if (raw === null) {
    return {
      ok: false,
      reason: "UNAVAILABLE",
      message: "Charge history response did not contain a list of charges.",
    };
  }

  const charges = (raw as ChargeItemBody[])
    .map((item) => toChargeRecord(item, mandateId))
    .filter((record): record is ChargeRecord => record !== null);

  return { ok: true, charges };
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

    listCharges: (id) => listChargesFor(id),

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
