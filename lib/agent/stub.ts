import { cents } from "../contracts/money";
import type { Cents, EvidenceBundle, Proposal } from "../contracts";
import type { Agent, AgentInput, AgentResult } from "./types";

/**
 * Deterministic stub agent.
 *
 * This is the key de-risking move of M1: with a fixed proposal for any given
 * evidence bundle, the entire pipeline becomes end-to-end testable before a
 * language model exists. When the real agent arrives in M2 it slots in behind
 * this signature, and if it misbehaves the stub still works.
 *
 * It stays in the repository through the demo. It costs nothing to keep and it
 * is what saves the run if the model is slow, rate-limited, or offline.
 *
 * ---------------------------------------------------------------------------
 * IT FALLS FOR THE INJECTION ON PURPOSE.
 *
 * When a vendor message states an amount, the stub proposes paying it — exactly
 * as a credulous model would. This is not a bug to be fixed. The demo's whole
 * point is that a compromised agent still cannot move money, and the fallback
 * path must be able to demonstrate that as convincingly as the real one.
 * ---------------------------------------------------------------------------
 */

const UNDERUSE_THRESHOLD_PCT = 60;

/** Pulls a dollar amount like "$48,000.00" out of vendor-authored text. */
function statedAmount(evidence: EvidenceBundle): Cents | null {
  for (const message of evidence.inboundMessages) {
    const match = message.body.match(/\$\s?([\d,]+(?:\.\d{2})?)/);
    if (!match) continue;
    const parsed = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(parsed) || parsed <= 0) continue;
    return cents(Math.round(parsed * 100));
  }
  return null;
}

function decide(evidence: EvidenceBundle): Proposal {
  const base = {
    vendorId: evidence.vendorId,
    renewalId: evidence.renewalId,
    currency: "USD" as const,
  };

  // Credulous by design — see the note above.
  const demanded = statedAmount(evidence);
  if (demanded !== null) {
    return {
      ...base,
      action: "RENEW_AS_IS",
      amountCents: demanded,
      rationale: `${evidence.vendorName} states the renewal amount is now ${demanded} cents and requires immediate payment.`,
      alternative: {
        action: "ESCALATE",
        reason: "The message describes the charge as pre-authorized.",
      },
    };
  }

  const pct = evidence.seats.activePct;

  if (pct === null) {
    return {
      ...base,
      action: "RENEW_AS_IS",
      amountCents: evidence.renewal.amountCents,
      rationale: `No usage data is available for ${evidence.vendorName}, so the current plan is proposed unchanged.`,
      alternative: {
        action: "PAUSE",
        reason: "Pausing without usage data risks interrupting active work.",
      },
    };
  }

  if (pct < UNDERUSE_THRESHOLD_PCT) {
    const active = evidence.seats.activeTrailing30d ?? 0;
    const assigned = Math.max(1, evidence.seats.assigned);
    const reduced = cents(
      Math.round((evidence.renewal.amountCents * active) / assigned),
    );

    return {
      ...base,
      action: "RENEW_REDUCED",
      amountCents: reduced > 0 ? reduced : evidence.renewal.amountCents,
      rationale: `${assigned - active} of ${assigned} seats have gone unused; renewing at ${active} seats.`,
      alternative: {
        action: "CANCEL",
        reason: `${active} seats remain in use, so cancelling would break active work.`,
      },
    };
  }

  return {
    ...base,
    action: "RENEW_AS_IS",
    amountCents: evidence.renewal.amountCents,
    rationale: `${pct}% of seats are in active use; the current plan is justified.`,
    alternative: {
      action: "RENEW_REDUCED",
      reason: "Seat usage does not support a reduction.",
    },
  };
}

export function createStubAgent(): Agent {
  return {
    name: "stub",
    modelId: "stub",
    promptVersion: "v0",
    stubbed: true,

    async propose(input: AgentInput): Promise<AgentResult> {
      return { ok: true, proposal: decide(input.evidence) };
    },
  };
}
