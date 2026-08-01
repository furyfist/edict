import { matchesRule } from "./conditions";
import {
  KNOWN_ACTIONS,
  MONEY_MOVING_ACTIONS,
  TERMINAL_DEFAULT,
  type EngineInput,
  type EngineVerdict,
  type PolicyRule,
} from "./types";

/**
 * The policy engine.
 *
 * Pure. It performs no I/O, reads no clock, uses no randomness, and calls no
 * model. Given the same input it returns the same verdict, forever. That is the
 * product's central claim and it is a property of this function, not of a
 * prompt or a convention.
 *
 * Evaluation is two-pass:
 *
 *   Pass 1 — denials. Every DENY rule is considered, in ordinal order. If any
 *            matches, the decision is DENY and evaluation stops.
 *   Pass 2 — permissions. The remaining rules are considered in ordinal order
 *            and the first match wins.
 *
 * The two passes are the whole point. Under single-pass first-match-wins, a
 * permissive rule written early silently defeats a prohibition written later,
 * which means the order someone happened to type their sentences in decides
 * whether a prohibition holds. Two passes make denials absolute regardless of
 * where they appear in the text.
 *
 * Exactly one rule id is cited on every verdict, including the terminal
 * default. There is no path through this function that returns a decision
 * without saying which rule produced it.
 */
export function evaluate(input: EngineInput): EngineVerdict {
  const { evidence, proposal, rules, policyVersionId } = input;
  const gaps = [...evidence.gaps];

  const base = {
    bundleId: evidence.bundleId,
    proposalId: proposal ? proposal.proposalId : null,
    renewalId: evidence.renewal.id,
    policyVersionId,
    evidenceGaps: gaps,
  };

  // A missing proposal is an ordinary outcome, not an exception. The agent
  // failed to produce one; that resolves to an escalation, never to a charge.
  if (!proposal) {
    return {
      ...base,
      decision: "REQUIRE_APPROVAL",
      reason: "MALFORMED_PROPOSAL",
      citedRuleId: TERMINAL_DEFAULT.id,
      citedSourceFragment: TERMINAL_DEFAULT.sourceFragment,
      citedRuleDescription:
        "No usable proposal was produced for this renewal, so it requires human approval.",
      permittedAmount: null,
      appliedCeiling: null,
      counterfactual: {
        kind: "DIFFERENT_ACTION",
        detail: {},
      },
    };
  }

  // An action outside the known set is treated as unknown rather than being
  // mapped onto the nearest thing that looks like it.
  if (!(KNOWN_ACTIONS as readonly string[]).includes(proposal.action)) {
    return {
      ...base,
      decision: "REQUIRE_APPROVAL",
      reason: "UNKNOWN_ACTION",
      citedRuleId: TERMINAL_DEFAULT.id,
      citedSourceFragment: TERMINAL_DEFAULT.sourceFragment,
      citedRuleDescription: `The proposed action is not one this system recognizes, so it requires human approval.`,
      permittedAmount: null,
      appliedCeiling: null,
      counterfactual: { kind: "DIFFERENT_ACTION", detail: {} },
    };
  }

  const ordered = [...rules].sort(compareRules);

  // ---- Pass 1: denials are absolute. ----
  for (const rule of ordered) {
    if (rule.effect !== "DENY") continue;
    if (!matchesRule(rule.conditions, evidence, proposal)) continue;
    return {
      ...base,
      decision: "DENY",
      reason: "DENIAL_PASS",
      citedRuleId: rule.id,
      citedSourceFragment: rule.sourceFragment,
      citedRuleDescription: rule.description,
      permittedAmount: null,
      appliedCeiling: rule.amountCeiling,
      counterfactual: {
        kind: "RULE_ABSENT",
        detail: { blockingRuleId: rule.id },
      },
    };
  }

  // ---- Pass 2: first permissive match wins. ----
  for (const rule of ordered) {
    if (rule.effect === "DENY") continue;
    if (!matchesRule(rule.conditions, evidence, proposal)) continue;

    if (rule.effect === "REQUIRE_APPROVAL") {
      return {
        ...base,
        decision: "REQUIRE_APPROVAL",
        reason: "RULE_MATCHED",
        citedRuleId: rule.id,
        citedSourceFragment: rule.sourceFragment,
        citedRuleDescription: rule.description,
        permittedAmount: null,
        appliedCeiling: rule.amountCeiling,
        counterfactual: null,
      };
    }

    // ALLOW_AUTO. Everything below is what stands between a matched rule and
    // an unattended charge.
    return adjudicateAutoRule(rule, input, base);
  }

  // ---- Terminal default. ----
  return {
    ...base,
    decision: TERMINAL_DEFAULT.effect,
    reason: "TERMINAL_DEFAULT",
    citedRuleId: TERMINAL_DEFAULT.id,
    citedSourceFragment: TERMINAL_DEFAULT.sourceFragment,
    citedRuleDescription: TERMINAL_DEFAULT.description,
    permittedAmount: null,
    appliedCeiling: null,
    counterfactual: { kind: "RULE_ABSENT", detail: {} },
  };
}

type VerdictBase = Pick<
  EngineVerdict,
  | "bundleId"
  | "proposalId"
  | "renewalId"
  | "policyVersionId"
  | "evidenceGaps"
>;

/**
 * An ALLOW_AUTO rule matched. It still has to survive three checks before it
 * permits anything, and each one downgrades to REQUIRE_APPROVAL rather than
 * failing open.
 */
function adjudicateAutoRule(
  rule: PolicyRule,
  input: EngineInput,
  base: VerdictBase,
): EngineVerdict {
  const { evidence, proposal } = input;

  // 1. Evidence gaps. Acting unattended on incomplete facts is exactly the
  //    behavior the product exists to prevent, so any gap escalates.
  if (evidence.gaps.length > 0) {
    return {
      ...base,
      decision: "REQUIRE_APPROVAL",
      reason: "MISSING_EVIDENCE",
      citedRuleId: rule.id,
      citedSourceFragment: rule.sourceFragment,
      citedRuleDescription: rule.description,
      permittedAmount: null,
      appliedCeiling: rule.amountCeiling,
      counterfactual: {
        kind: "EVIDENCE_PRESENT",
        detail: { missingGaps: [...evidence.gaps] },
      },
    };
  }

  const movesMoney = (MONEY_MOVING_ACTIONS as readonly string[]).includes(
    proposal!.action,
  );

  if (!movesMoney) {
    // PAUSE, CANCEL, ESCALATE. No amount, so no ceiling applies.
    return {
      ...base,
      decision: "ALLOW_AUTO",
      reason: "RULE_MATCHED",
      citedRuleId: rule.id,
      citedSourceFragment: rule.sourceFragment,
      citedRuleDescription: rule.description,
      permittedAmount: null,
      appliedCeiling: rule.amountCeiling,
      counterfactual: null,
    };
  }

  // 2. An ALLOW_AUTO rule without a ceiling is unbounded authority. The
  //    compiler refuses to produce one; if one reaches the engine anyway —
  //    hand-written, migrated, or corrupted — it is not honored.
  if (rule.amountCeiling === null) {
    return {
      ...base,
      decision: "REQUIRE_APPROVAL",
      reason: "AMOUNT_EXCEEDS_CEILING",
      citedRuleId: rule.id,
      citedSourceFragment: rule.sourceFragment,
      citedRuleDescription: rule.description,
      permittedAmount: null,
      appliedCeiling: null,
      counterfactual: { kind: "AMOUNT_BELOW_CEILING", detail: {} },
    };
  }

  // 3. The amount is re-derived from evidence, not read from the proposal.
  //    An agent that asks for more than the renewal is worth cannot obtain it
  //    by asking, and one that asks for less is held to the smaller figure.
  const proposedCents = proposal!.amount ? proposal!.amount.cents : null;
  const evidenceCents = evidence.renewal.amount.cents;

  if (proposedCents === null) {
    return {
      ...base,
      decision: "REQUIRE_APPROVAL",
      reason: "MALFORMED_PROPOSAL",
      citedRuleId: rule.id,
      citedSourceFragment: rule.sourceFragment,
      citedRuleDescription: rule.description,
      permittedAmount: null,
      appliedCeiling: rule.amountCeiling,
      counterfactual: { kind: "DIFFERENT_ACTION", detail: {} },
    };
  }

  const adjudicated = Math.min(proposedCents, evidenceCents);

  if (adjudicated > rule.amountCeiling) {
    return {
      ...base,
      decision: "REQUIRE_APPROVAL",
      reason: "AMOUNT_EXCEEDS_CEILING",
      citedRuleId: rule.id,
      citedSourceFragment: rule.sourceFragment,
      citedRuleDescription: rule.description,
      permittedAmount: null,
      appliedCeiling: rule.amountCeiling,
      counterfactual: {
        kind: "AMOUNT_BELOW_CEILING",
        detail: { ceiling: rule.amountCeiling, actualAmount: adjudicated },
      },
    };
  }

  return {
    ...base,
    decision: "ALLOW_AUTO",
    reason: "RULE_MATCHED",
    citedRuleId: rule.id,
    citedSourceFragment: rule.sourceFragment,
    citedRuleDescription: rule.description,
    permittedAmount: {
      cents: adjudicated,
      currency: evidence.renewal.amount.currency,
    },
    appliedCeiling: rule.amountCeiling,
    counterfactual: null,
  };
}

/**
 * Ordinal, then rule id. The tiebreak matters: two rules sharing an ordinal
 * would otherwise be ordered by however they arrived from the database, and a
 * verdict that depends on row order is not deterministic.
 */
function compareRules(a: PolicyRule, b: PolicyRule): number {
  if (a.ordinal !== b.ordinal) return a.ordinal - b.ordinal;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
