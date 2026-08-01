import type { Cents, Currency, IsoTimestamp } from "./common";

/**
 * Contract 3 — the policy rule.
 *
 * The compiled form of one sentence a human wrote. Rules are data, evaluated by
 * a pure function. Every rule carries the fragment of English it came from, so
 * a refusal can quote the user's own words back to them.
 */

export const RULE_EFFECTS = ["ALLOW_AUTO", "REQUIRE_APPROVAL", "DENY"] as const;
export type RuleEffect = (typeof RULE_EFFECTS)[number];

/** Facts a condition can address. Closed set — the engine matches on these. */
export const CONDITION_FIELDS = [
  "AMOUNT",
  "VENDOR_ID",
  "VENDOR_CATEGORY",
  "PRICE_INCREASE_BASIS_POINTS",
  "DORMANT_SEAT_COUNT",
  "DORMANT_SEAT_RATIO_BASIS_POINTS",
  "ACTION",
  "EVIDENCE_GAP",
] as const;
export type ConditionField = (typeof CONDITION_FIELDS)[number];

export const CONDITION_OPERATORS = [
  "LTE",
  "LT",
  "GTE",
  "GT",
  "EQ",
  "NEQ",
  "IN",
  "NOT_IN",
  "PRESENT",
  "ABSENT",
] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

export interface RuleCondition {
  field: ConditionField;
  operator: ConditionOperator;
  /**
   * Comparison operand. Numeric for AMOUNT (cents) and basis-point fields,
   * string or string[] for identity fields, absent for PRESENT/ABSENT.
   */
  value?: number | string | string[];
}

export interface PolicyRule {
  id: string;
  /** Evaluation order within the version. Lower runs first within a pass. */
  ordinal: number;
  effect: RuleEffect;
  /** All conditions must hold for the rule to match. Empty means always. */
  conditions: RuleCondition[];
  /**
   * Amount ceiling in cents. Required on every ALLOW_AUTO rule — an ALLOW_AUTO
   * without a ceiling is unbounded authority and cannot be compiled.
   */
  amountCeiling: Cents | null;
  currency: Currency;
  /** The exact substring of the policy text this rule was compiled from. */
  sourceFragment: string;
  /** Human-readable restatement, rendered in refusals. */
  description: string;
}

export interface PolicyVersion {
  id: string;
  version: number;
  /** The English the human wrote. The rules are derived from exactly this. */
  sourceText: string;
  rules: PolicyRule[];
  /** DRAFT has no force. Only a human confirmation makes a version ACTIVE. */
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED";
  createdAt: IsoTimestamp;
  activatedAt: IsoTimestamp | null;
  /** Who confirmed it. Never an agent. */
  activatedBy: string | null;
}

/**
 * The terminal default. Reached when no rule matches. It is REQUIRE_APPROVAL
 * and never ALLOW_AUTO — invariant 6, expressed as a constant so it cannot be
 * accidentally changed by editing branching logic.
 */
export const TERMINAL_DEFAULT_RULE: PolicyRule = {
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
