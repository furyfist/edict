import { complete, isConfigured } from "../agent/client";
import { formatCents } from "../contracts/money";
import type { Cents } from "../contracts";

/**
 * Vendor cancellation and downgrade drafts.
 *
 * This is the one place in the system where a language model writes prose that
 * a human will read as prose, and where variation is a virtue rather than a
 * tell. The audit line is a template; this is not.
 *
 * It is also the honest answer to the gap in the pitch: pausing a mandate
 * declines the charge, it does not end the contract. Volunteering that before
 * anyone asks reads as rigour. Hiding it reads as a hole.
 *
 * NOTHING IS EVER SENT. The draft is an artifact shown on screen and attached
 * to the ledger entry. Sending would mean deliverability, spam filters, and a
 * real side effect on stage — three risks for no additional proof.
 */

export type DraftKind = "CANCEL" | "DOWNGRADE" | "PAUSE";

export interface DraftRequest {
  vendorName: string;
  billingContact: string;
  kind: DraftKind;
  /** ISO date on the demo clock. */
  effectiveDate: string;
  currentAmountCents: Cents;
  /** Present on DOWNGRADE. */
  newAmountCents?: Cents;
  seatsFrom?: number;
  seatsTo?: number;
}

export interface EmailDraft {
  to: string;
  subject: string;
  body: string;
  /** True when the deterministic fallback wrote it rather than the model. */
  templated: boolean;
}

const SYSTEM_PROMPT = `You write short, professional emails to software vendors on behalf of a company's finance team.

Rules:
- Six sentences maximum. Plain and direct; no marketing tone, no apologies, no filler.
- State exactly what is changing, and the effective date.
- Ask for written confirmation.
- Do not invent contract terms, account numbers, contacts, or prices beyond what you are given.
- Do not threaten, and do not negotiate.
- Sign off as "Finance Operations".`;

function fallbackDraft(request: DraftRequest): EmailDraft {
  const {
    vendorName,
    billingContact,
    kind,
    effectiveDate,
    currentAmountCents,
    newAmountCents,
    seatsFrom,
    seatsTo,
  } = request;

  const seatClause =
    seatsFrom !== undefined && seatsTo !== undefined
      ? ` from ${seatsFrom} seats to ${seatsTo} seats`
      : "";

  const subject =
    kind === "CANCEL"
      ? `Cancellation of our ${vendorName} subscription`
      : kind === "PAUSE"
        ? `Pausing our ${vendorName} subscription`
        : `Reducing our ${vendorName} plan`;

  const middle =
    kind === "CANCEL"
      ? `We are cancelling our ${vendorName} subscription, effective ${effectiveDate}. Our current billing is ${formatCents(currentAmountCents)} per cycle.`
      : kind === "PAUSE"
        ? `We are pausing our ${vendorName} subscription, effective ${effectiveDate}. Our current billing is ${formatCents(currentAmountCents)} per cycle.`
        : `We are reducing our ${vendorName} plan${seatClause}, effective ${effectiveDate}. This changes our billing from ${formatCents(currentAmountCents)}${
            newAmountCents !== undefined
              ? ` to ${formatCents(newAmountCents)}`
              : ""
          } per cycle.`;

  return {
    to: billingContact,
    subject,
    body: `Hello,\n\n${middle}\n\nPlease confirm this change in writing and let us know if anything further is required from our side.\n\nThank you,\nFinance Operations`,
    templated: true,
  };
}

/**
 * Never throws and never blocks the pipeline. A failed draft degrades to the
 * template — the artifact must exist for the demo whether or not a model does.
 */
export async function draftVendorEmail(
  request: DraftRequest,
): Promise<EmailDraft> {
  if (!isConfigured()) {
    return fallbackDraft(request);
  }

  const facts = [
    `vendor: ${request.vendorName}`,
    `billing contact: ${request.billingContact}`,
    `change: ${request.kind}`,
    `effective date: ${request.effectiveDate}`,
    `current amount per cycle: ${formatCents(request.currentAmountCents)}`,
    request.newAmountCents !== undefined
      ? `new amount per cycle: ${formatCents(request.newAmountCents)}`
      : null,
    request.seatsFrom !== undefined ? `seats before: ${request.seatsFrom}` : null,
    request.seatsTo !== undefined ? `seats after: ${request.seatsTo}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const result = await complete({
    system: SYSTEM_PROMPT,
    user: `Write the email using only these facts.\n\n${facts}`,
    schemaName: "vendor_email",
    jsonSchema: {
      type: "object",
      additionalProperties: false,
      required: ["subject", "body"],
      properties: {
        subject: { type: "string" },
        body: { type: "string" },
      },
    },
  });

  if (!result.ok) return fallbackDraft(request);

  try {
    const parsed = JSON.parse(result.content) as {
      subject?: unknown;
      body?: unknown;
    };
    if (typeof parsed.subject !== "string" || typeof parsed.body !== "string") {
      return fallbackDraft(request);
    }
    if (parsed.subject.trim().length === 0 || parsed.body.trim().length === 0) {
      return fallbackDraft(request);
    }

    return {
      to: request.billingContact,
      subject: parsed.subject.trim(),
      body: parsed.body.trim(),
      templated: false,
    };
  } catch {
    return fallbackDraft(request);
  }
}

export { fallbackDraft };
