import type { Cents, Currency } from "./money";
import type { Action } from "./enums";

/**
 * CONTRACT 2 — Proposal
 *
 * The agent's output, and the boundary of everything the language model is
 * permitted to do.
 *
 * A proposal is advisory. It is not a command, not an authorization, and not an
 * instruction to the payment adapter. It is discarded whenever the policy engine
 * says so, and the model has no path to money whether or not it is discarded.
 *
 * Note what is deliberately absent: no evidence claims. The model does not get
 * to restate facts, because the engine would ignore them anyway. Rationale and
 * alternative are prose for humans to read, never inputs to a decision.
 */

export interface ProposalAlternative {
  action: Action;
  /** Why this option lost. Exactly one alternative — three would be noise. */
  reason: string;
}

export interface Proposal {
  vendorId: string;
  renewalId: string;

  action: Action;
  /**
   * Proposed charge in cents. Validated as a positive integer on receipt;
   * anything else becomes MALFORMED_PROPOSAL.
   */
  amountCents: Cents;
  currency: Currency;

  /** One sentence. Rendered in a separate, labeled region as model output. */
  rationale: string;
  alternative: ProposalAlternative;
}

/**
 * Provenance of a proposal, recorded for attribution. Kept separate from the
 * proposal itself so the shape the engine sees carries no authority signals.
 */
export interface ProposalOrigin {
  /** Model identifier, e.g. the exact model string used. */
  modelId: string;
  /** Bumped whenever the agent prompt changes, so entries stay comparable. */
  promptVersion: string;
  /** True when produced by the deterministic stub rather than a live model. */
  stubbed: boolean;
}
