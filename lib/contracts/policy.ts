import type { Cents } from "./money";
import type { Effect, Frequency } from "./enums";

/**
 * CONTRACT 3 — PolicyRule and Policy
 *
 * A policy is a versioned, ordered list of rules compiled from English the user
 * actually wrote. Policies are immutable: editing produces a new version.
 *
 * Two invariants live in this shape:
 *
 *  1. Every rule carries `sourceFragment` — the words it was derived from. A
 *     rule with no textual origin is rejected at compile time, because every
 *     enforcement in this product must trace back to something a human said.
 *
 *  2. An ALLOW_AUTO rule must carry `maxAmountCents`. Unbounded autonomy is not
 *     merely discouraged, it is uncompilable. Enforced where authority is
 *     created, not where it is spent.
 */

export type RuleScope =
  | { kind: "VENDOR"; vendorId: string }
  | { kind: "CATEGORY"; category: string }
  | { kind: "ANY" };

export interface RuleConditions {
  /** Per-charge ceiling. Required on ALLOW_AUTO rules. */
  maxAmountCents?: Cents;
  /** Minimum active-seat percentage, 0–100. */
  minActiveSeatPct?: number;
  /** Restricts the rule to renewals of this billing frequency. */
  frequency?: Frequency;
  /** Restricts the rule to renewals falling due within N days. */
  renewalWithinDays?: number;
}

export interface PolicyRule {
  id: string;
  /** Position in the ordered list. Lower is earlier. */
  ordinal: number;
  effect: Effect;
  scope: RuleScope;
  conditions: RuleConditions;
  /**
   * The span of the user's English this rule was derived from. Must appear
   * verbatim in the policy text. Rendered inline wherever the rule is cited.
   */
  sourceFragment: string;
}

export const POLICY_STATUSES = ["DRAFT", "ACTIVE", "SUPERSEDED"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export interface Policy {
  id: string;
  /** Monotonic. Version 1 is the first compiled policy. */
  version: number;
  /** Exactly what the user typed. Never normalized or rewritten. */
  englishText: string;
  /** Ordered by ordinal. Always ends with the terminal default rule. */
  rules: PolicyRule[];
  status: PolicyStatus;
  /** ISO datetime. */
  compiledAt: string;
  /** ISO datetime, or null while the policy is still an inert draft. */
  activatedAt: string | null;
}

/**
 * The terminal default, appended by the compiler rather than compiled from
 * text. Unmatched cases are unknown cases, and unknown reaches a human.
 *
 * It is not ALLOW (that would be unbounded authority) and not DENY (an agent
 * that silently refuses everything looks broken rather than careful).
 */
export const TERMINAL_RULE_ID = "terminal-default";

export function terminalRule(ordinal: number): PolicyRule {
  return {
    id: TERMINAL_RULE_ID,
    ordinal,
    effect: "REQUIRE_APPROVAL",
    scope: { kind: "ANY" },
    conditions: {},
    sourceFragment: "(default: anything not covered above is sent to you)",
  };
}

/** An ALLOW_AUTO rule without an amount ceiling is uncompilable. */
export function hasUnboundedAuthority(rule: PolicyRule): boolean {
  return rule.effect === "ALLOW_AUTO" && rule.conditions.maxAmountCents === undefined;
}
