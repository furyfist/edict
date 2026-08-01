import { ACTIONS, CURRENCY, isAction } from "../contracts";
import type { Action, EvidenceBundle, Proposal } from "../contracts";

/**
 * Agent output contract validation.
 *
 * The boundary that turns raw model output into either a Proposal or a refusal.
 * Pure — no I/O, no model, testable against adversarial fixtures.
 *
 * Three principles:
 *
 *  1. **Never repair, never re-prompt.** Output that misses the contract becomes
 *     MALFORMED and is refused. Asking the model again more nicely is how you
 *     end up negotiating with something that has already demonstrated it will
 *     not follow instructions.
 *
 *  2. **Bind to the subject.** A proposal must name the vendor and renewal it
 *     was asked about. A well-formed proposal for a DIFFERENT vendor is a
 *     redirection attempt — hallucinated or injected — and is the single most
 *     dangerous thing a compromised model could return, because everything
 *     downstream would look legitimate.
 *
 *  3. **Bound the strings.** Rationale and reason are untrusted text that gets
 *     stored and rendered. Length caps keep an injected payload from becoming a
 *     wall of attacker-controlled prose in the ledger.
 */

const MAX_RATIONALE_CHARS = 400;
const MAX_REASON_CHARS = 400;

export type ValidationResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; message: string };

function fail(message: string): ValidationResult {
  return { ok: false, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/**
 * @param raw      the parsed JSON the model returned
 * @param evidence the bundle it was asked about — used to bind the subject
 */
export function validateProposal(
  raw: unknown,
  evidence: EvidenceBundle,
): ValidationResult {
  if (!isPlainObject(raw)) {
    return fail("Output was not a JSON object.");
  }

  // -- subject binding ------------------------------------------------------
  if (raw.vendorId !== evidence.vendorId) {
    return fail(
      `Proposal names vendor ${String(raw.vendorId)} but was asked about ${evidence.vendorId}.`,
    );
  }
  if (raw.renewalId !== evidence.renewalId) {
    return fail(
      `Proposal names renewal ${String(raw.renewalId)} but was asked about ${evidence.renewalId}.`,
    );
  }

  // -- action ---------------------------------------------------------------
  if (!isAction(raw.action)) {
    return fail(
      `Action ${JSON.stringify(raw.action)} is outside the permitted set (${ACTIONS.join(", ")}).`,
    );
  }

  // -- amount ---------------------------------------------------------------
  const amount = raw.amountCents;
  if (typeof amount !== "number" || !Number.isFinite(amount)) {
    return fail("amountCents must be a number.");
  }
  if (!Number.isInteger(amount)) {
    return fail("amountCents must be an integer number of cents, not a fraction.");
  }
  if (amount <= 0) {
    return fail("amountCents must be greater than zero.");
  }
  if (amount > Number.MAX_SAFE_INTEGER) {
    return fail("amountCents is out of range.");
  }

  // -- currency -------------------------------------------------------------
  if (raw.currency !== CURRENCY) {
    return fail(`Currency must be ${CURRENCY}, got ${JSON.stringify(raw.currency)}.`);
  }

  // -- prose ----------------------------------------------------------------
  const rationale = cleanString(raw.rationale, MAX_RATIONALE_CHARS);
  if (!rationale) {
    return fail("rationale must be a non-empty string.");
  }

  if (!isPlainObject(raw.alternative)) {
    return fail("alternative must be an object.");
  }
  if (!isAction(raw.alternative.action)) {
    return fail(
      `Alternative action ${JSON.stringify(raw.alternative.action)} is outside the permitted set.`,
    );
  }
  const reason = cleanString(raw.alternative.reason, MAX_REASON_CHARS);
  if (!reason) {
    return fail("alternative.reason must be a non-empty string.");
  }

  const proposal: Proposal = {
    vendorId: evidence.vendorId,
    renewalId: evidence.renewalId,
    action: raw.action as Action,
    amountCents: amount as Proposal["amountCents"],
    currency: CURRENCY,
    rationale,
    alternative: {
      action: raw.alternative.action as Action,
      reason,
    },
  };

  return { ok: true, proposal };
}

/** Parses then validates. Invalid JSON is MALFORMED like anything else. */
export function parseAndValidate(
  content: string,
  evidence: EvidenceBundle,
): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return fail("Output was not valid JSON.");
  }
  return validateProposal(parsed, evidence);
}

/** Structured-output schema. Constrains shape at generation time. */
export const PROPOSAL_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "vendorId",
    "renewalId",
    "action",
    "amountCents",
    "currency",
    "rationale",
    "alternative",
  ],
  properties: {
    vendorId: { type: "string" },
    renewalId: { type: "string" },
    action: { type: "string", enum: [...ACTIONS] },
    amountCents: { type: "integer" },
    currency: { type: "string", enum: [CURRENCY] },
    rationale: { type: "string" },
    alternative: {
      type: "object",
      additionalProperties: false,
      required: ["action", "reason"],
      properties: {
        action: { type: "string", enum: [...ACTIONS] },
        reason: { type: "string" },
      },
    },
  },
};
