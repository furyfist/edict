/**
 * The engine's own view of its inputs and outputs.
 *
 * These shapes are structurally identical to the corresponding contracts in
 * `lib/contracts`, and they are redeclared here rather than imported. That is
 * not duplication for its own sake: invariant 3 says this directory imports
 * nothing outside itself, and an import of `lib/contracts` today is the edge
 * along which an import of `lib/db` arrives later. The boundary is easier to
 * hold when there is nothing crossing it at all.
 *
 * Callers pass contract values directly; TypeScript accepts them structurally.
 */

export type Cents = number;
export type Currency = "USD";
export interface Money {
  cents: Cents;
  currency: Currency;
}

export type RuleEffect = "ALLOW_AUTO" | "REQUIRE_APPROVAL" | "DENY";

export type ConditionField =
  | "AMOUNT"
  | "VENDOR_ID"
  | "VENDOR_CATEGORY"
  | "PRICE_INCREASE_BASIS_POINTS"
  | "DORMANT_SEAT_COUNT"
  | "DORMANT_SEAT_RATIO_BASIS_POINTS"
  | "ACTION"
  | "EVIDENCE_GAP";

export type ConditionOperator =
  | "LTE"
  | "LT"
  | "GTE"
  | "GT"
  | "EQ"
  | "NEQ"
  | "IN"
  | "NOT_IN"
  | "PRESENT"
  | "ABSENT";

export interface RuleCondition {
  field: ConditionField;
  operator: ConditionOperator;
  value?: number | string | string[];
}

export interface PolicyRule {
  id: string;
  ordinal: number;
  effect: RuleEffect;
  conditions: RuleCondition[];
  amountCeiling: Cents | null;
  currency: Currency;
  sourceFragment: string;
  description: string;
}

export interface EngineEvidence {
  bundleId: string;
  vendor: { id: string; name: string; category: string };
  renewal: { id: string; amount: Money };
  seats: { licensed: number; active: number; dormant: number } | null;
  priceChange: { deltaBasisPoints: number } | null;
  gaps: readonly string[];
}

export interface EngineProposal {
  proposalId: string;
  bundleId: string;
  renewalId: string;
  action: string;
  amount: Money | null;
}

export type VerdictReason =
  | "RULE_MATCHED"
  | "TERMINAL_DEFAULT"
  | "DENIAL_PASS"
  | "AMOUNT_EXCEEDS_CEILING"
  | "MISSING_EVIDENCE"
  | "MALFORMED_PROPOSAL"
  | "UNKNOWN_ACTION";

export interface VerdictCounterfactual {
  kind:
    | "AMOUNT_BELOW_CEILING"
    | "EVIDENCE_PRESENT"
    | "DIFFERENT_ACTION"
    | "RULE_ABSENT";
  detail: {
    ceiling?: Cents;
    actualAmount?: Cents;
    missingGaps?: string[];
    blockingRuleId?: string;
  };
}

export interface EngineVerdict {
  bundleId: string;
  proposalId: string | null;
  renewalId: string;
  decision: RuleEffect;
  reason: VerdictReason;
  citedRuleId: string;
  citedSourceFragment: string;
  citedRuleDescription: string;
  policyVersionId: string;
  permittedAmount: Money | null;
  appliedCeiling: Cents | null;
  evidenceGaps: string[];
  counterfactual: VerdictCounterfactual | null;
}

/** Everything the engine is given. There are no other inputs — no clock, no I/O. */
export interface EngineInput {
  evidence: EngineEvidence;
  /** Null when the agent produced no proposal at all. Adjudicated, not thrown. */
  proposal: EngineProposal | null;
  rules: readonly PolicyRule[];
  policyVersionId: string;
}

/** Actions the engine recognizes. Anything else is UNKNOWN_ACTION. */
export const KNOWN_ACTIONS = [
  "RENEW",
  "RENEW_REDUCED_SEATS",
  "PAUSE",
  "CANCEL",
  "ESCALATE",
] as const;

/** Actions that move money. Only these are subject to an amount ceiling. */
export const MONEY_MOVING_ACTIONS = ["RENEW", "RENEW_REDUCED_SEATS"] as const;

/**
 * The terminal default. Reached when no rule matches, and it is
 * REQUIRE_APPROVAL rather than ALLOW_AUTO. Held as a constant so that no
 * edit to the branching can change what "unknown" means.
 */
export const TERMINAL_DEFAULT: PolicyRule = {
  id: "terminal-default",
  ordinal: Number.MAX_SAFE_INTEGER,
  effect: "REQUIRE_APPROVAL",
  conditions: [],
  amountCeiling: null,
  currency: "USD",
  sourceFragment: "",
  description:
    "No rule in the active policy addresses this action, so it requires human approval.",
};
