import { db } from "../db/client";
import type { Cents, Frequency, MandateStatus } from "../contracts";
import { centsToDecimal, isPravaConfigured, pravaRequest } from "./http";
import { wallNow } from "../clock";
import { paymentBoundary } from "./index";

/**
 * Mandate lifecycle — creation, mirroring, and status changes.
 *
 * Prava owns mandate truth. The `Mandate` table is a MIRROR, refreshed from the
 * source on every tick, and it is never treated as authoritative. If the mirror
 * and Prava disagree, Prava is right and the mirror is stale.
 *
 * Creating a mandate always goes through a passkey ceremony. There is no code
 * path here that mints authority — only one that asks a human to.
 */

const FREQUENCY_MAP: Record<Frequency, string> = {
  ONE_TIME: "one_time",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  YEARLY: "yearly",
};

/**
 * Real merchant domains, because this value is FORWARDED TO VISA.
 *
 * This is not cosmetic. Visa uses the merchant URL as part of the FIDO
 * relying-party context when starting the passkey ceremony, and it rejects
 * domains that are not real registrable names — returning a 400 that Prava
 * surfaces as `FIDO_START_FAILED`.
 *
 * An earlier version generated `https://<vendor>.example` here. `.example` is
 * RFC 2606's reserved TLD, which is the correct choice for documentation but
 * the wrong one for a live payment network: it does not exist in the DNS root,
 * so every ceremony failed before the browser was ever asked to prompt. The
 * failure looked exactly like a broken authenticator, which sent debugging in
 * entirely the wrong direction.
 *
 * The seeded vendors are real companies and their list pricing is real (see
 * docs/disclosure.md), so using their real domains is also the more honest
 * representation.
 */
const VENDOR_DOMAINS: Record<string, string> = {
  Figma: "https://www.figma.com",
  Linear: "https://linear.app",
  Notion: "https://www.notion.so",
  Datadog: "https://www.datadoghq.com",
  Loom: "https://www.loom.com",
  Airtable: "https://www.airtable.com",
  Vercel: "https://vercel.com",
};

/** Falls back to a well-formed .com for vendors not in the map. */
export function merchantUrlFor(vendorName: string): string {
  const known = VENDOR_DOMAINS[vendorName];
  if (known) return known;
  const slug = vendorName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return `https://www.${slug}.com`;
}

export interface MandateSetupResult {
  ok: boolean;
  sessionId?: string;
  /** Where the owner goes to approve with a passkey. */
  approvalUrl?: string;
  expiresAt?: string;
  error?: string;
  /**
   * True when no payment provider is configured at all — distinct from a
   * provider that answered and refused.
   *
   * There is deliberately no mock ceremony behind this flag. A simulated
   * passkey would be a fabricated security ceremony, and this product's whole
   * claim is that authority requires a real human, a real device, and a real
   * biometric. Faking that on stage would be the single most damaging thing
   * in the repository if anyone looked closely.
   *
   * So the honest answer is the only answer: no provider, no ceremony, no new
   * authority. Which is exactly the invariant the beat exists to show.
   */
  unavailable?: boolean;
}

/**
 * Opens a mandate-setup session.
 *
 * Returns a URL, not a mandate. The mandate does not exist until the owner
 * approves it with a passkey on Prava's surface — this function cannot create
 * authority, only request it.
 *
 * Note: recurring frequencies force `merchant_scope: "listed"`. Sending `any`
 * with a recurring frequency is rejected by Prava, and rightly so — a standing
 * authorization that works at any merchant is not a guardrail.
 */
export async function openMandateSetup(input: {
  vendorName: string;
  ownerId: string;
  ownerEmail: string;
  capCents: Cents;
  frequency: Frequency;
  validUntil: string;
  maxCharges: number;
}): Promise<MandateSetupResult> {
  if (!isPravaConfigured()) {
    return {
      ok: false,
      unavailable: true,
      error: "No payment provider is configured, so no ceremony can be opened.",
    };
  }

  const response = await pravaRequest<{
    session_id?: string;
    iframe_url?: string;
    expires_at?: string;
    error?: string;
  }>({
    method: "POST",
    path: "/v1/sessions",
    body: {
      user_id: input.ownerId,
      user_email: input.ownerEmail,
      total_amount: centsToDecimal(input.capCents),
      currency: "USD",
      integration_type: "full_checkout",
      // Exactly one entry — Prava does not support multi-merchant sessions.
      purchase_context: [
        {
          merchant_details: {
            name: input.vendorName,
            url: merchantUrlFor(input.vendorName),
            country_code_iso2: "US",
          },
          product_details: [
            {
              description: `${input.vendorName} subscription`,
              unit_price: centsToDecimal(input.capCents),
              quantity: 1,
            },
          ],
        },
      ],
      mandate_setup: {
        intent: "mandate_setup",
        recurring_frequency: FREQUENCY_MAP[input.frequency],
        // Always locked to the named vendor, including for one-time mandates.
        // `any` scope would let a standing authorization be spent anywhere,
        // which is not a guardrail.
        merchant_scope: "listed",
        valid_until: input.validUntil,
        max_charges: input.maxCharges,
      },
    },
  });

  if (!response.ok || !response.body?.iframe_url) {
    return {
      ok: false,
      error:
        response.transportError ??
        response.body?.error ??
        `Mandate setup failed with status ${response.status}.`,
    };
  }

  return {
    ok: true,
    sessionId: response.body.session_id,
    approvalUrl: response.body.iframe_url,
    expiresAt: response.body.expires_at,
  };
}

/** Refreshes one mirrored mandate from Prava. Silent no-op when absent. */
export async function refreshMandate(vendorId: string): Promise<void> {
  const local = await db.mandate.findUnique({ where: { vendorId } });
  if (!local) return;

  const snapshot = await paymentBoundary().getMandate(local.pravaMandateId);
  if (!snapshot) return;

  await db.mandate.update({
    where: { vendorId },
    data: {
      status: snapshot.status,
      capCents: snapshot.capCents,
      remainingCents: snapshot.remainingCents,
      expiresAt: snapshot.expiresAt ? new Date(snapshot.expiresAt) : null,
      refreshedAt: wallNow(),
    },
  });
}

/**
 * Refreshes every mirrored mandate. Called at the start of each tick so
 * decisions are made against current authority rather than yesterday's.
 */
export async function refreshAllMandates(): Promise<number> {
  const mandates = await db.mandate.findMany({ select: { vendorId: true } });
  for (const mandate of mandates) {
    await refreshMandate(mandate.vendorId);
  }
  return mandates.length;
}

async function transition(
  vendorId: string,
  action: "pause" | "resume" | "cancel",
): Promise<{ ok: boolean; status?: MandateStatus; error?: string }> {
  const local = await db.mandate.findUnique({ where: { vendorId } });
  if (!local) return { ok: false, error: "No mandate for this vendor." };

  const boundary = paymentBoundary();
  const snapshot =
    action === "pause"
      ? await boundary.pauseMandate(local.pravaMandateId)
      : action === "resume"
        ? await boundary.resumeMandate(local.pravaMandateId)
        : await boundary.cancelMandate(local.pravaMandateId);

  if (!snapshot) {
    // Prava rejects illegal transitions with 409. The mirror is left untouched
    // rather than optimistically updated — guessing would make it lie.
    return { ok: false, error: `Could not ${action} this mandate.` };
  }

  await db.mandate.update({
    where: { vendorId },
    data: {
      status: snapshot.status,
      remainingCents: snapshot.remainingCents,
      refreshedAt: wallNow(),
    },
  });

  return { ok: true, status: snapshot.status };
}

export const pauseMandate = (vendorId: string) => transition(vendorId, "pause");
export const resumeMandate = (vendorId: string) => transition(vendorId, "resume");
export const cancelMandate = (vendorId: string) => transition(vendorId, "cancel");

export async function listMandates() {
  return db.mandate.findMany({ orderBy: { refreshedAt: "desc" } });
}
