import { prisma } from "../db/client";
import type {
  ChargeRequest,
  ChargeResult,
  CreateMandateRequest,
  HealthResult,
  Mandate,
  MandateResult,
  MandateStatus,
  PravaAdapter,
} from "./types";

/**
 * The real Prava adapter — the only module that moves real money.
 *
 * It satisfies the same interface the mock has satisfied since M1, which is
 * what makes this swap a single-module change with exactly one suspect if
 * anything misbehaves after it.
 *
 * The design decision that matters most here: every failure is normalized into
 * the same typed result the mock produces. A 402 from the network, a timeout,
 * and a malformed response body are three very different events, and all three
 * become a `ChargeFailure` with a `kind` the outcome router already knows how
 * to handle. Nothing here throws into the tick.
 *
 * The over-cap decline is the demo climax and it is not implemented here — it
 * is implemented in Prava. This adapter asks for a charge above the mandate's
 * ceiling and faithfully reports the refusal. The whole point is that we are
 * not the ones saying no.
 */

const DEFAULT_BASE = "https://sandbox.api.prava.com";
const TIMEOUT_MS = 15_000;

function baseUrl(): string {
  return (process.env.PRAVA_API_BASE || DEFAULT_BASE).replace(/\/+$/, "");
}

function apiKey(): string {
  return process.env.PRAVA_API_KEY ?? "";
}

interface FetchOutcome {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
  /** Set when no answer was received at all. */
  transport: "TIMEOUT" | "UNREACHABLE" | "MALFORMED_RESPONSE" | null;
}

/** One request. Never throws — the caller gets a shape it can branch on. */
async function call(
  path: string,
  init: { method: string; body?: unknown } = { method: "GET" },
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey()}`,
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });

    const text = await response.text();
    let body: Record<string, unknown> = {};
    if (text.trim()) {
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return {
          ok: false,
          status: response.status,
          body: { raw: text.slice(0, 500) },
          transport: "MALFORMED_RESPONSE",
        };
      }
    }

    return { ok: response.ok, status: response.status, body, transport: null };
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      ok: false,
      status: 0,
      body: { message: error instanceof Error ? error.message : String(error) },
      transport: aborted ? "TIMEOUT" : "UNREACHABLE",
    };
  } finally {
    clearTimeout(timer);
  }
}

function str(body: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value) return value;
  }
  return null;
}

function num(body: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function toMandate(body: Record<string, unknown>): Mandate | null {
  const mandateId = str(body, "id", "mandate_id", "mandateId");
  if (!mandateId) return null;

  const rawStatus = (str(body, "status") ?? "ACTIVE").toUpperCase();
  const status: MandateStatus = (
    ["ACTIVE", "PAUSED", "CANCELLED", "EXPIRED"] as const
  ).includes(rawStatus as MandateStatus)
    ? (rawStatus as MandateStatus)
    : "EXPIRED";

  return {
    mandateId,
    status,
    amountCeilingCents:
      num(body, "amount_ceiling_cents", "amountCeilingCents", "limit_amount") ??
      0,
    spentCents: num(body, "spent_cents", "spentCents", "used_amount") ?? 0,
    currency: (str(body, "currency") ?? "USD") as Mandate["currency"],
    merchantId: str(body, "merchant_id", "merchantId"),
    expiresAt: str(body, "expires_at", "expiresAt"),
  };
}

/**
 * Map a network answer onto the failure taxonomy.
 *
 * The distinction the rest of the system depends on: a decline is an answer
 * and is never retried; the absence of an answer retries exactly once. That
 * decision is made here, once, rather than at each call site.
 */
function classify(outcome: FetchOutcome): {
  kind:
    | "DECLINED"
    | "MANDATE_PAUSED"
    | "MANDATE_NOT_FOUND"
    | "MANDATE_EXPIRED"
    | "TIMEOUT"
    | "UNREACHABLE"
    | "MALFORMED_RESPONSE";
  message: string;
} {
  if (outcome.transport) {
    return {
      kind: outcome.transport,
      message:
        (typeof outcome.body.message === "string" && outcome.body.message) ||
        "No answer was received from the payment network.",
    };
  }

  const code = (
    str(outcome.body, "code", "error_code", "decline_code") ?? ""
  ).toLowerCase();
  const message =
    str(outcome.body, "message", "error", "detail") ??
    `The payment network refused the charge (HTTP ${outcome.status}).`;

  if (outcome.status === 404 || code.includes("not_found")) {
    return { kind: "MANDATE_NOT_FOUND", message };
  }
  if (code.includes("paused")) return { kind: "MANDATE_PAUSED", message };
  if (code.includes("expired")) return { kind: "MANDATE_EXPIRED", message };

  // 402, 403, 409, and anything else with a body: the network considered the
  // charge and refused it. That is an answer.
  if (outcome.status >= 400 && outcome.status < 500) {
    return { kind: "DECLINED", message };
  }

  // 5xx is the network failing to answer, not refusing.
  return { kind: "UNREACHABLE", message };
}

export class LivePravaAdapter implements PravaAdapter {
  readonly mode = "live" as const;

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const outcome = await call("/v1/charges", {
      method: "POST",
      body: {
        mandate_id: request.mandateId,
        amount: request.amountCents,
        currency: request.currency,
        idempotency_key: request.idempotencyKey,
        description: request.description,
      },
    });

    if (outcome.ok) {
      const chargeId = str(outcome.body, "id", "charge_id", "chargeId");
      if (!chargeId) {
        // A 200 with no charge id is not a success we can record. Treating it
        // as one would put an entry in the ledger with no identifier to
        // cross-check, which is the one thing the ledger must never contain.
        return {
          ok: false,
          kind: "MALFORMED_RESPONSE",
          networkMessage:
            "The network accepted the charge but returned no charge id.",
          chargeId: null,
          sessionId: str(outcome.body, "session_id", "sessionId"),
        };
      }
      return {
        ok: true,
        chargeId,
        sessionId: str(outcome.body, "session_id", "sessionId") ?? chargeId,
        amountCents: num(outcome.body, "amount") ?? request.amountCents,
        currency: request.currency,
      };
    }

    const { kind, message } = classify(outcome);
    return {
      ok: false,
      kind,
      // The network's own words, carried through unedited. When the demo
      // claims the refusal came from Prava, this is the evidence.
      networkMessage: message,
      chargeId: str(outcome.body, "id", "charge_id", "chargeId"),
      sessionId: str(outcome.body, "session_id", "sessionId"),
    };
  }

  async createMandate(request: CreateMandateRequest): Promise<MandateResult> {
    const outcome = await call("/v1/mandates", {
      method: "POST",
      body: {
        merchant_id: request.merchantId,
        amount_ceiling_cents: request.amountCeilingCents,
        currency: request.currency,
        expires_at: request.expiresAt,
        // Present only for a ceiling raise. Authority originates in a signed
        // ceremony, never in this application's database.
        passkey_ceremony_id: request.passkeyCeremonyId,
        metadata: { vendor_id: request.vendorId },
      },
    });

    if (!outcome.ok) {
      return { ok: false, mandate: null, error: classify(outcome).message };
    }

    const mandate = toMandate(outcome.body);
    if (!mandate) {
      return {
        ok: false,
        mandate: null,
        error: "The network returned a mandate with no identifier.",
      };
    }

    await this.mirror(mandate, request.vendorId);
    return { ok: true, mandate, error: null };
  }

  async getMandate(mandateId: string): Promise<MandateResult> {
    const outcome = await call(`/v1/mandates/${encodeURIComponent(mandateId)}`);
    if (!outcome.ok) {
      return { ok: false, mandate: null, error: classify(outcome).message };
    }
    const mandate = toMandate(outcome.body);
    return mandate
      ? { ok: true, mandate, error: null }
      : { ok: false, mandate: null, error: "Unrecognized mandate response." };
  }

  async pauseMandate(mandateId: string): Promise<MandateResult> {
    return this.transition(mandateId, "pause");
  }

  async resumeMandate(mandateId: string): Promise<MandateResult> {
    return this.transition(mandateId, "resume");
  }

  async cancelMandate(mandateId: string): Promise<MandateResult> {
    return this.transition(mandateId, "cancel");
  }

  async listMandates(): Promise<Mandate[]> {
    const outcome = await call("/v1/mandates");
    if (!outcome.ok) return [];
    const data = outcome.body.data ?? outcome.body.mandates;
    if (!Array.isArray(data)) return [];
    return data
      .map((item) =>
        typeof item === "object" && item !== null
          ? toMandate(item as Record<string, unknown>)
          : null,
      )
      .filter((m): m is Mandate => m !== null);
  }

  async health(): Promise<HealthResult> {
    if (!apiKey()) {
      return {
        healthy: false,
        detail: "PRAVA_API_KEY is not configured.",
      };
    }
    const outcome = await call("/v1/health");
    return outcome.ok
      ? { healthy: true, detail: "The payment network is reachable." }
      : { healthy: false, detail: classify(outcome).message };
  }

  private async transition(
    mandateId: string,
    action: "pause" | "resume" | "cancel",
  ): Promise<MandateResult> {
    const outcome = await call(
      `/v1/mandates/${encodeURIComponent(mandateId)}/${action}`,
      { method: "POST" },
    );
    if (!outcome.ok) {
      return { ok: false, mandate: null, error: classify(outcome).message };
    }
    const mandate = toMandate(outcome.body);
    if (mandate) await this.mirror(mandate, null);
    return mandate
      ? { ok: true, mandate, error: null }
      : { ok: false, mandate: null, error: "Unrecognized mandate response." };
  }

  /**
   * Update the local mirror. Prava owns mandate truth; this row is a cache,
   * and it is written from the network's answer rather than from what we
   * expected the network to say.
   */
  private async mirror(
    mandate: Mandate,
    vendorId: string | null,
  ): Promise<void> {
    const state = await prisma.systemState.findUnique({
      where: { id: "singleton" },
    });
    const mirroredAt = state ? state.now : new Date(0);

    await prisma.mandate.upsert({
      where: { pravaMandateId: mandate.mandateId },
      create: {
        pravaMandateId: mandate.mandateId,
        vendorId: vendorId ?? "unknown",
        merchantId: mandate.merchantId,
        status: mandate.status,
        amountCeilingCents: mandate.amountCeilingCents,
        spentCents: mandate.spentCents,
        currency: mandate.currency,
        expiresAt: mandate.expiresAt ? new Date(mandate.expiresAt) : null,
        mirroredAt,
      },
      update: {
        status: mandate.status,
        amountCeilingCents: mandate.amountCeilingCents,
        spentCents: mandate.spentCents,
        expiresAt: mandate.expiresAt ? new Date(mandate.expiresAt) : null,
        mirroredAt,
      },
    });
  }
}
