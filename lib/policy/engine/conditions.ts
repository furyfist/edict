import type {
  ConditionOperator,
  EngineEvidence,
  EngineProposal,
  RuleCondition,
} from "./types";

/**
 * Condition matching. Pure, total, and fail-closed.
 *
 * The single rule that governs this file: when a condition addresses a fact the
 * evidence does not contain, the condition does not match. A rule whose
 * conditions cannot be evaluated is a rule that does not apply, and a rule that
 * does not apply cannot grant permission. Invariant 6 falls out of this rather
 * than being bolted on top of it.
 *
 * The one exception is ABSENT, which is a question about a fact's absence and
 * is answerable precisely when the fact is missing.
 */

/** The value a field resolves to, or `undefined` when the fact is unavailable. */
export type FieldValue = number | string | string[] | undefined;

export function resolveField(
  condition: RuleCondition,
  evidence: EngineEvidence,
  proposal: EngineProposal | null,
): FieldValue {
  switch (condition.field) {
    case "AMOUNT": {
      // The amount adjudicated is the proposal's, when it moves money, and
      // otherwise the renewal's. The engine never takes the agent's word for
      // the renewal amount; it re-derives it from evidence when it needs it.
      if (proposal && proposal.amount) return proposal.amount.cents;
      return evidence.renewal.amount.cents;
    }
    case "VENDOR_ID":
      return evidence.vendor.id;
    case "VENDOR_CATEGORY":
      return evidence.vendor.category;
    case "PRICE_INCREASE_BASIS_POINTS":
      return evidence.priceChange
        ? evidence.priceChange.deltaBasisPoints
        : undefined;
    case "DORMANT_SEAT_COUNT":
      return evidence.seats ? evidence.seats.dormant : undefined;
    case "DORMANT_SEAT_RATIO_BASIS_POINTS": {
      if (!evidence.seats || evidence.seats.licensed <= 0) return undefined;
      // Integer basis points. No floating point in a comparison that decides
      // whether money moves.
      return Math.round(
        (evidence.seats.dormant * 10_000) / evidence.seats.licensed,
      );
    }
    case "ACTION":
      return proposal ? proposal.action : undefined;
    case "EVIDENCE_GAP":
      return [...evidence.gaps];
    default:
      return undefined;
  }
}

function compareNumeric(
  operator: ConditionOperator,
  actual: number,
  operand: unknown,
): boolean {
  if (typeof operand !== "number" || !Number.isFinite(operand)) return false;
  switch (operator) {
    case "LTE":
      return actual <= operand;
    case "LT":
      return actual < operand;
    case "GTE":
      return actual >= operand;
    case "GT":
      return actual > operand;
    case "EQ":
      return actual === operand;
    case "NEQ":
      return actual !== operand;
    default:
      return false;
  }
}

function asStringList(operand: unknown): string[] | null {
  if (Array.isArray(operand) && operand.every((v) => typeof v === "string")) {
    return operand;
  }
  return null;
}

export function matchesCondition(
  condition: RuleCondition,
  evidence: EngineEvidence,
  proposal: EngineProposal | null,
): boolean {
  const actual = resolveField(condition, evidence, proposal);

  // PRESENT and ABSENT ask about availability itself, so they are answered
  // before the missing-fact rule below.
  if (condition.operator === "PRESENT") {
    if (condition.field === "EVIDENCE_GAP") {
      const gaps = Array.isArray(actual) ? actual : [];
      const wanted = condition.value;
      if (typeof wanted === "string") return gaps.includes(wanted);
      const list = asStringList(wanted);
      if (list) return list.some((g) => gaps.includes(g));
      return gaps.length > 0;
    }
    return actual !== undefined;
  }

  if (condition.operator === "ABSENT") {
    if (condition.field === "EVIDENCE_GAP") {
      const gaps = Array.isArray(actual) ? actual : [];
      const wanted = condition.value;
      if (typeof wanted === "string") return !gaps.includes(wanted);
      const list = asStringList(wanted);
      if (list) return !list.some((g) => gaps.includes(g));
      return gaps.length === 0;
    }
    return actual === undefined;
  }

  // The fail-closed core: an unanswerable condition does not match.
  if (actual === undefined) return false;

  if (Array.isArray(actual)) {
    // The only list-valued field is EVIDENCE_GAP, handled by set membership.
    const list = asStringList(condition.value);
    switch (condition.operator) {
      case "IN":
        return list ? list.some((g) => actual.includes(g)) : false;
      case "NOT_IN":
        return list ? !list.some((g) => actual.includes(g)) : false;
      case "EQ":
        return typeof condition.value === "string"
          ? actual.includes(condition.value)
          : false;
      case "NEQ":
        return typeof condition.value === "string"
          ? !actual.includes(condition.value)
          : false;
      default:
        return false;
    }
  }

  if (typeof actual === "number") {
    return compareNumeric(condition.operator, actual, condition.value);
  }

  // String-valued fields.
  switch (condition.operator) {
    case "EQ":
      return actual === condition.value;
    case "NEQ":
      return actual !== condition.value;
    case "IN": {
      const list = asStringList(condition.value);
      return list ? list.includes(actual) : false;
    }
    case "NOT_IN": {
      const list = asStringList(condition.value);
      return list ? !list.includes(actual) : false;
    }
    default:
      // Ordering operators against a string are meaningless, so they do not
      // match rather than coercing into an accidental comparison.
      return false;
  }
}

/** All conditions must hold. An empty condition list always matches. */
export function matchesRule(
  conditions: readonly RuleCondition[],
  evidence: EngineEvidence,
  proposal: EngineProposal | null,
): boolean {
  return conditions.every((c) => matchesCondition(c, evidence, proposal));
}
