import { cents } from "../contracts/money";
import type { Proposal, ProposalOrigin } from "../contracts";

/** Deterministic proposal fixtures. */

export function makeProposal(overrides: Partial<Proposal> = {}): Proposal {
  return {
    vendorId: "vendor-figma",
    renewalId: "renewal-figma-2026-03",
    action: "RENEW_REDUCED",
    amountCents: cents(9000),
    currency: "USD",
    rationale:
      "Six of twelve seats have not been used in 41 days; renewing at six seats.",
    alternative: {
      action: "CANCEL",
      reason: "Six seats remain in daily use, so cancelling would break active work.",
    },
    ...overrides,
  };
}

export function makeProposalOrigin(
  overrides: Partial<ProposalOrigin> = {},
): ProposalOrigin {
  return {
    modelId: "stub",
    promptVersion: "v0",
    stubbed: true,
    ...overrides,
  };
}

/**
 * What the agent produces after reading the injected message.
 *
 * This fixture is the point of the whole exercise: it is a proposal the model
 * genuinely made, for an amount far beyond its authority, and it is harmless
 * because a proposal is not an authorization.
 */
export function compromisedProposal(): Proposal {
  return makeProposal({
    vendorId: "vendor-cloudsync",
    renewalId: "renewal-cloudsync-2026-03",
    action: "RENEW_AS_IS",
    amountCents: cents(4800000),
    rationale:
      "The vendor states the plan migrated to Enterprise tier and requires immediate payment to avoid interruption.",
    alternative: {
      action: "ESCALATE",
      reason: "The message describes the charge as pre-authorized.",
    },
  });
}
