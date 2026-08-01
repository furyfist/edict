import {
  isProposedAction,
  type EvidenceBundle,
  type ProposalResult,
} from "../contracts";
import { truncate } from "./client";

/**
 * The agent output contract.
 *
 * This is the boundary that converts model output into a proposal or a
 * refusal. It is the most security-relevant file in `lib/agent`, and the rule
 * it enforces is simple: nothing the model says is trusted, and anything that
 * does not conform exactly produces `MALFORMED_PROPOSAL`.
 *
 * Three things this deliberately does not do:
 *
 *   It does not retry with a softer prompt. A model that produced malformed
 *   output once will produce it again, and a retry loop that eventually gets a
 *   conforming answer is a loop that rewards persistence over correctness. One
 *   attempt, then a refusal.
 *
 *   It does not repair. No trimming a stray character off a number, no
 *   coercing "45.00" into cents, no mapping "renew_it" onto RENEW. Every
 *   repair is a guess about intent, and a guess about intent at the boundary
 *   between a language model and a payment system is exactly the wrong place
 *   to be clever.
 *
 *   It does not throw. A malformed response is an ordinary outcome that flows
 *   into the pipeline and gets adjudicated. The engine turns it into an
 *   escalation, and the ledger records it.
 */

/** Amounts are integer cents. Anything else is not an amount. */
function isValidCents(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Number.isFinite(value) &&
    value >= 0 &&
    // A renewal larger than this is not a renewal, it is a typo or an attack.
    value <= 100_000_00
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface ValidationContext {
  bundle: EvidenceBundle;
  producedBy: string;
}

function refuse(
  context: ValidationContext,
  detail: string,
): ProposalResult {
  return {
    ok: false,
    failure: {
      bundleId: context.bundle.bundleId,
      renewalId: context.bundle.renewal.id,
      reason: "MALFORMED_PROPOSAL",
      detail: truncate(detail),
      producedBy: context.producedBy,
    },
  };
}

/**
 * Parse and validate raw model output.
 *
 * `raw` is whatever the model returned. It may be JSON, prose, JSON wrapped in
 * prose, an empty string, or something adversarial.
 */
export function validateProposal(
  raw: string,
  context: ValidationContext,
): ProposalResult {
  const { bundle } = context;

  if (!isNonEmptyString(raw)) {
    return refuse(context, "The model returned an empty response.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // No salvaging a JSON object out of surrounding prose. A response that is
    // not JSON did not follow the contract, and extracting the first
    // brace-delimited span is a repair by another name.
    return refuse(context, `The model response was not valid JSON: ${raw}`);
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return refuse(context, "The model response was not a JSON object.");
  }

  const candidate = parsed as Record<string, unknown>;

  // Extra fields are a contract violation, not a harmless addition. A response
  // carrying a field the contract does not define is a response shaped by
  // something other than the contract.
  const allowed = new Set([
    "action",
    "amountCents",
    "seatCount",
    "rationale",
    "rejectedAlternative",
  ]);
  const extra = Object.keys(candidate).filter((key) => !allowed.has(key));
  if (extra.length > 0) {
    return refuse(
      context,
      `The model response carried unexpected fields: ${extra.join(", ")}.`,
    );
  }

  const action = candidate.action;
  if (!isProposedAction(action)) {
    return refuse(
      context,
      `The proposed action is not in the permitted set: ${String(action)}.`,
    );
  }

  const movesMoney = action === "RENEW" || action === "RENEW_REDUCED_SEATS";
  const amountCents = candidate.amountCents;

  if (movesMoney) {
    if (!isValidCents(amountCents)) {
      return refuse(
        context,
        `A ${action} proposal requires an integer amount in cents; got ${String(amountCents)}.`,
      );
    }
    // A proposal for more than the renewal is worth is refused here as well as
    // in the engine. Two independent checks, because this one is cheap and the
    // failure it catches is the one an injected message would produce.
    if (amountCents > bundle.renewal.amount.cents) {
      return refuse(
        context,
        `The proposed amount ${amountCents} exceeds the renewal amount ${bundle.renewal.amount.cents}.`,
      );
    }
  } else if (amountCents !== null && amountCents !== undefined) {
    return refuse(
      context,
      `A ${action} proposal must not carry an amount.`,
    );
  }

  const seatCount = candidate.seatCount;
  if (action === "RENEW_REDUCED_SEATS") {
    if (
      typeof seatCount !== "number" ||
      !Number.isInteger(seatCount) ||
      seatCount <= 0
    ) {
      return refuse(
        context,
        `A seat reduction requires a positive integer seat count; got ${String(seatCount)}.`,
      );
    }
    if (bundle.seats && seatCount > bundle.seats.licensed) {
      return refuse(
        context,
        `The proposed seat count ${seatCount} exceeds the ${bundle.seats.licensed} licensed seats.`,
      );
    }
  } else if (
    seatCount !== null &&
    seatCount !== undefined &&
    typeof seatCount !== "number"
  ) {
    return refuse(context, "The seat count was neither a number nor null.");
  }

  if (!isNonEmptyString(candidate.rationale)) {
    return refuse(context, "The proposal carried no rationale.");
  }
  if (!isNonEmptyString(candidate.rejectedAlternative)) {
    return refuse(context, "The proposal named no rejected alternative.");
  }

  return {
    ok: true,
    proposal: {
      proposalId: `proposal_${bundle.renewal.id}_${bundle.observedAt}`,
      bundleId: bundle.bundleId,
      renewalId: bundle.renewal.id,
      proposedAt: bundle.observedAt,
      action,
      // Prose is bounded before it is stored. It reaches a rendered page, and
      // an unbounded string from a model is an unbounded string on a page.
      amount: movesMoney
        ? { cents: amountCents as number, currency: bundle.renewal.amount.currency }
        : null,
      seatCount:
        action === "RENEW_REDUCED_SEATS" ? (seatCount as number) : null,
      rationale: truncate(candidate.rationale, 400),
      rejectedAlternative: truncate(candidate.rejectedAlternative, 400),
      producedBy: context.producedBy,
    },
  };
}
