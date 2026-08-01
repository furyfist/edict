import type { Cents, Money } from "./common";
import type { EvidenceGap } from "./evidence";
import type { RuleEffect } from "./policy";

/**
 * Contract 4 — the verdict.
 *
 * The output of the pure engine. Exactly one rule id is always cited, including
 * when the terminal default applies — an unexplained decision is not a decision
 * this system is willing to make.
 *
 * A verdict is a decision, not an instruction. Turning it into an instruction
 * is the outcome router's job, which keeps branching out of the engine.
 */

export type VerdictDecision = RuleEffect;

/** Why the engine landed where it did. Rendered by the explainer, not by an LLM. */
export const VERDICT_REASONS = [
  "RULE_MATCHED",
  "TERMINAL_DEFAULT",
  "DENIAL_PASS",
  "AMOUNT_EXCEEDS_CEILING",
  "MISSING_EVIDENCE",
  "MALFORMED_PROPOSAL",
  "UNKNOWN_ACTION",
] as const;
export type VerdictReason = (typeof VERDICT_REASONS)[number];

export interface Verdict {
  /** The bundle and proposal this verdict adjudicates. */
  bundleId: string;
  proposalId: string | null;
  renewalId: string;

  decision: VerdictDecision;
  reason: VerdictReason;

  /** Always populated. Exactly one rule is cited for every verdict. */
  citedRuleId: string;
  /** The English fragment behind the cited rule, empty for the default. */
  citedSourceFragment: string;
  /** Restatement of the cited rule, for rendering. */
  citedRuleDescription: string;

  /** The policy version the decision was made under. Pinned per tick. */
  policyVersionId: string;

  /** Amount the verdict permits, when it permits one. */
  permittedAmount: Money | null;
  /** Ceiling that applied, when a ceiling was in play. */
  appliedCeiling: Cents | null;

  /** Gaps the engine took into account. Copied from the bundle. */
  evidenceGaps: EvidenceGap[];

  /**
   * What would have had to differ for the decision to go the other way.
   * Structured, so the explainer renders it deterministically.
   */
  counterfactual: VerdictCounterfactual | null;
}

export interface VerdictCounterfactual {
  kind:
    | "AMOUNT_BELOW_CEILING"
    | "EVIDENCE_PRESENT"
    | "DIFFERENT_ACTION"
    | "RULE_ABSENT";
  /** Structured detail the explainer templates over. Never free prose. */
  detail: {
    ceiling?: Cents;
    actualAmount?: Cents;
    missingGaps?: EvidenceGap[];
    blockingRuleId?: string;
  };
}

export function isAutoExecutable(v: Verdict): boolean {
  return v.decision === "ALLOW_AUTO";
}
