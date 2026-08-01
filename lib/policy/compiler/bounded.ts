import type { PolicyRule } from "../../contracts";

/**
 * Unbounded authority, made structurally impossible.
 *
 * The validation in `validate.ts` rejects an `ALLOW_AUTO` rule with no
 * ceiling. This module is the second, narrower thing: a type and a constructor
 * such that a bounded auto-approval rule is the only kind that can be built at
 * all. The distinction matters because a validation is a branch someone can
 * add an exception to under time pressure, whereas a type is a thing the
 * compiler refuses to let them do.
 *
 * Every path from English to an active policy passes through `toPolicyRule`.
 * There is no other constructor, and `activate` in the API layer accepts only
 * rules that came from here.
 */

/** An auto-approval rule that has been proven to carry a ceiling. */
export interface BoundedAutoRule extends PolicyRule {
  effect: "ALLOW_AUTO";
  amountCeiling: number;
}

/** A rule whose effect grants no unattended spending. */
export interface NonSpendingRule extends PolicyRule {
  effect: "REQUIRE_APPROVAL" | "DENY";
}

/**
 * The only rule shapes the system will act on. An `ALLOW_AUTO` rule with a
 * null ceiling does not inhabit this type — it is not a rule that failed a
 * check, it is a value that cannot be constructed.
 */
export type EnforceableRule = BoundedAutoRule | NonSpendingRule;

export class UnboundedAuthorityError extends Error {
  constructor(readonly sourceFragment: string) {
    super(
      `“${sourceFragment}” would permit unattended spending with no upper ` +
        `limit. Every automatic approval must name an amount ceiling.`,
    );
    this.name = "UnboundedAuthorityError";
  }
}

/**
 * Narrow a compiled rule to an enforceable one, or refuse.
 *
 * This throws rather than returning a result type, deliberately: it is called
 * only after `validateCompilation` has already rejected unbounded rules, so
 * reaching the throw means a rule slipped past that check. That is a bug in
 * the compiler, not a user error, and it should be loud.
 */
export function toEnforceableRule(rule: PolicyRule): EnforceableRule {
  if (rule.effect !== "ALLOW_AUTO") {
    return rule as NonSpendingRule;
  }

  if (
    rule.amountCeiling === null ||
    !Number.isInteger(rule.amountCeiling) ||
    rule.amountCeiling < 0
  ) {
    throw new UnboundedAuthorityError(rule.sourceFragment);
  }

  return rule as BoundedAutoRule;
}

/**
 * Narrow a whole policy. Used at the activation boundary — the point where a
 * draft becomes something the tick runner will act on.
 */
export function toEnforceablePolicy(
  rules: readonly PolicyRule[],
): EnforceableRule[] {
  return rules.map(toEnforceableRule);
}

/**
 * Whether a rule set can be activated. Used by the API route to decide
 * without catching, since a rejected activation is an ordinary user outcome.
 */
export function findUnboundedRules(
  rules: readonly PolicyRule[],
): PolicyRule[] {
  return rules.filter(
    (rule) =>
      rule.effect === "ALLOW_AUTO" &&
      (rule.amountCeiling === null ||
        !Number.isInteger(rule.amountCeiling) ||
        rule.amountCeiling < 0),
  );
}
