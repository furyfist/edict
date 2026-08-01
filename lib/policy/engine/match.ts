import type { EvidenceBundle, PolicyRule, Proposal, RuleScope } from "../../contracts";

/**
 * Scope and condition matching.
 *
 * One rule governs everything here: **a condition that cannot be evaluated does
 * not match.**
 *
 * When usage data is absent, a rule requiring 60% usage does not fire — not for
 * ALLOW and not for DENY. An unevaluable rule is simply skipped, and the
 * evidence-completeness check downstream escalates to a human. Absence is never
 * silently treated as zero, because zero is a fact and absence is not.
 */

export function scopeMatches(scope: RuleScope, evidence: EvidenceBundle): boolean {
  switch (scope.kind) {
    case "ANY":
      return true;
    case "VENDOR":
      return scope.vendorId === evidence.vendorId;
    case "CATEGORY":
      return scope.category === evidence.category;
  }
}

/** Every condition present on the rule must hold. Absent conditions are ignored. */
export function conditionsMatch(
  rule: PolicyRule,
  proposal: Proposal,
  evidence: EvidenceBundle,
): boolean {
  const { maxAmountCents, minActiveSeatPct, frequency, renewalWithinDays } =
    rule.conditions;

  if (maxAmountCents !== undefined && proposal.amountCents > maxAmountCents) {
    return false;
  }

  if (minActiveSeatPct !== undefined) {
    const pct = evidence.seats.activePct;
    // Unknown usage cannot satisfy a usage condition.
    if (pct === null) return false;
    if (pct < minActiveSeatPct) return false;
  }

  if (frequency !== undefined && evidence.renewal.frequency !== frequency) {
    return false;
  }

  if (
    renewalWithinDays !== undefined &&
    evidence.renewal.daysUntilDue > renewalWithinDays
  ) {
    return false;
  }

  return true;
}

export function ruleMatches(
  rule: PolicyRule,
  proposal: Proposal,
  evidence: EvidenceBundle,
): boolean {
  return (
    scopeMatches(rule.scope, evidence) && conditionsMatch(rule, proposal, evidence)
  );
}

/** Ordinal order, ascending. Never mutates the input. */
export function byOrdinal(rules: PolicyRule[]): PolicyRule[] {
  return [...rules].sort((a, b) => a.ordinal - b.ordinal);
}
