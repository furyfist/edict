import { cents } from "../contracts/money";
import type { Cents } from "../contracts";

/**
 * HTTP plumbing for the Prava adapter, and the money boundary.
 *
 * Prava speaks decimal strings — `"40.00"`. This system speaks integer cents,
 * everywhere, because floating-point money is a bug waiting for the worst
 * possible moment. The conversion happens HERE and nowhere else: nothing above
 * this file ever sees a decimal, and nothing below it ever sees a Cents.
 */

const DEFAULT_BASE = "https://sandbox.api.prava.space";

export function apiBase(): string {
  return process.env.PRAVA_API_BASE ?? DEFAULT_BASE;
}

export function secretKey(): string | undefined {
  return process.env.PRAVA_SECRET_KEY;
}

export function isPravaConfigured(): boolean {
  return Boolean(secretKey());
}

/** 9000 → "90.00" */
export function centsToDecimal(value: Cents): string {
  return (value / 100).toFixed(2);
}

/** "90.00" → 9000. Tolerates numbers and malformed input. */
export function decimalToCents(value: unknown): Cents {
  if (typeof value === "number" && Number.isFinite(value)) {
    return cents(Math.round(value * 100));
  }
  if (typeof value !== "string") return cents(0);

  const parsed = Number.parseFloat(value.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(parsed) || parsed < 0) return cents(0);
  return cents(Math.round(parsed * 100));
}

export interface PravaResponse<T> {
  ok: boolean;
  status: number;
  body: T | null;
  /** Set when the request could not be completed at all. */
  transportError?: string;
}

const TIMEOUT_MS = 20_000;

export async function pravaRequest<T>(input: {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}): Promise<PravaResponse<T>> {
  const key = secretKey();
  if (!key) {
    return {
      ok: false,
      status: 0,
      body: null,
      transportError: "PRAVA_SECRET_KEY is not set.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${apiBase()}${input.path}`, {
      method: input.method,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(input.idempotencyKey
          ? { "Idempotency-Key": input.idempotencyKey }
          : {}),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: controller.signal,
    });

    let parsed: T | null = null;
    const text = await response.text();
    if (text) {
      try {
        parsed = JSON.parse(text) as T;
      } catch {
        parsed = null;
      }
    }

    return { ok: response.ok, status: response.status, body: parsed };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: null,
      transportError: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timer);
  }
}
