import type { IsoTimestamp, Money } from "./common";

/**
 * Contract 2 — the proposal.
 *
 * What the agent produces. It is a request, never an authorization. Nothing in
 * this shape can cause money to move; the outcome router only ever acts on a
 * verdict, and a verdict comes from the pure engine.
 *
 * The rationale and rejectedAlternative fields are model prose. They are
 * carried through to the UI in a separately labeled region and are never
 * parsed, matched against, or used by the engine.
 */

export const PROPOSED_ACTIONS = [
  "RENEW",
  "RENEW_REDUCED_SEATS",
  "PAUSE",
  "CANCEL",
  "ESCALATE",
] as const;
export type ProposedAction = (typeof PROPOSED_ACTIONS)[number];

export function isProposedAction(value: unknown): value is ProposedAction {
  return (
    typeof value === "string" &&
    (PROPOSED_ACTIONS as readonly string[]).includes(value)
  );
}

export interface Proposal {
  proposalId: string;
  /** The bundle this proposal was formed from. The engine re-derives facts. */
  bundleId: string;
  renewalId: string;
  proposedAt: IsoTimestamp;

  action: ProposedAction;
  /** Null for actions that move no money (PAUSE, CANCEL, ESCALATE). */
  amount: Money | null;
  /** Only meaningful for RENEW_REDUCED_SEATS. */
  seatCount: number | null;

  /** One sentence. Model prose. Never parsed. */
  rationale: string;
  /** One alternative the agent considered and rejected. Model prose. */
  rejectedAlternative: string;

  /** Which proposer produced this — "stub" or a model identifier. */
  producedBy: string;
}

/**
 * Why a proposal could not be formed. A refusal at this boundary is an
 * ordinary outcome, not an error: it flows into the pipeline and is adjudicated
 * like anything else, which is what keeps a bad model response from being a
 * crash.
 */
export const PROPOSAL_FAILURES = [
  "MALFORMED_PROPOSAL",
  "MODEL_UNREACHABLE",
  "MODEL_TIMEOUT",
] as const;
export type ProposalFailureReason = (typeof PROPOSAL_FAILURES)[number];

export interface ProposalFailure {
  bundleId: string;
  renewalId: string;
  reason: ProposalFailureReason;
  /** Truncated, escaped detail for the ledger. Never re-fed to the model. */
  detail: string;
  producedBy: string;
}

export type ProposalResult =
  | { ok: true; proposal: Proposal }
  | { ok: false; failure: ProposalFailure };
