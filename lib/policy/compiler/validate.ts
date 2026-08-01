import {
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  RULE_EFFECTS,
  type ConditionField,
  type ConditionOperator,
  type PolicyRule,
  type RuleCondition,
  type RuleEffect,
} from "../../contracts";
import type { CompileResult, CompilerRejection } from "./index";

/**
 * Compiler validations.
 *
 * The compiler's worst failure is silent partial compilation: dropping a
 * clause it did not understand and returning a policy that looks complete.
 * The user then believes a rule is enforced when nothing enforces it, and they
 * find out when a charge goes through that shouldn't have.
 *
 * Every check here converts that silence into a rejection that names the
 * clause. A policy either compiles completely or it does not compile.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateCondition(raw: unknown): RuleCondition | null {
  if (!isRecord(raw)) return null;

  const field = raw.field;
  const operator = raw.operator;

  if (
    typeof field !== "string" ||
    !(CONDITION_FIELDS as readonly string[]).includes(field)
  ) {
    return null;
  }
  if (
    typeof operator !== "string" ||
    !(CONDITION_OPERATORS as readonly string[]).includes(operator)
  ) {
    return null;
  }

  const value = raw.value;
  const acceptable =
    value === undefined ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every((v) => typeof v === "string"));

  if (!acceptable) return null;

  return {
    field: field as ConditionField,
    operator: operator as ConditionOperator,
    ...(value === undefined ? {} : { value: value as RuleCondition["value"] }),
  };
}

export function validateCompilation(
  parsed: unknown,
  sourceText: string,
): CompileResult {
  const rejections: CompilerRejection[] = [];
  const rules: PolicyRule[] = [];

  if (!isRecord(parsed)) {
    return {
      ok: false,
      sourceText,
      understood: [],
      rejections: [
        { clause: sourceText, reason: "The compiler output was not an object." },
      ],
    };
  }

  // Clauses the compiler itself reported as unsupported. Surfaced verbatim —
  // this is the honest half of the rejection surface.
  const unsupported = Array.isArray(parsed.unsupported)
    ? parsed.unsupported
    : [];
  for (const entry of unsupported) {
    if (!isRecord(entry)) continue;
    rejections.push({
      clause: typeof entry.clause === "string" ? entry.clause : "",
      reason:
        typeof entry.reason === "string"
          ? entry.reason
          : "This clause could not be expressed as a rule.",
    });
  }

  const rawRules = Array.isArray(parsed.rules) ? parsed.rules : [];

  if (rawRules.length === 0 && rejections.length === 0) {
    return {
      ok: false,
      sourceText,
      understood: [],
      rejections: [
        {
          clause: sourceText,
          reason:
            "No rules were produced from this text. Nothing would be enforced.",
        },
      ],
    };
  }

  for (const raw of rawRules) {
    if (!isRecord(raw)) {
      rejections.push({
        clause: "",
        reason: "The compiler produced a rule that was not an object.",
      });
      continue;
    }

    const fragment =
      typeof raw.sourceFragment === "string" ? raw.sourceFragment : "";
    const describeClause = fragment || "(unattributed rule)";

    const effect = raw.effect;
    if (
      typeof effect !== "string" ||
      !(RULE_EFFECTS as readonly string[]).includes(effect)
    ) {
      rejections.push({
        clause: describeClause,
        reason: `The compiler produced an unrecognized effect.`,
      });
      continue;
    }

    // Every rule must be traceable to text the user actually wrote. A rule
    // whose fragment is not in the input is a rule the compiler invented, and
    // an invented rule is indistinguishable from a hallucinated one.
    if (fragment.length === 0) {
      rejections.push({
        clause: describeClause,
        reason: "This rule carried no source fragment and cannot be traced.",
      });
      continue;
    }
    if (!sourceText.includes(fragment)) {
      rejections.push({
        clause: fragment,
        reason:
          "This rule cites text that does not appear in the policy you wrote.",
      });
      continue;
    }

    const conditionsRaw = Array.isArray(raw.conditions) ? raw.conditions : [];
    const conditions: RuleCondition[] = [];
    let conditionFailed = false;
    for (const c of conditionsRaw) {
      const condition = validateCondition(c);
      if (!condition) {
        rejections.push({
          clause: fragment,
          reason:
            "This rule contains a condition the policy engine cannot evaluate.",
        });
        conditionFailed = true;
        break;
      }
      conditions.push(condition);
    }
    if (conditionFailed) continue;

    const ceiling = raw.amountCeilingCents;
    const ceilingValid =
      ceiling === null ||
      (typeof ceiling === "number" &&
        Number.isInteger(ceiling) &&
        ceiling >= 0);

    if (!ceilingValid) {
      rejections.push({
        clause: fragment,
        reason: "The amount ceiling was not an integer number of cents.",
      });
      continue;
    }

    // The unbounded-authority rejection. This is the one validation in the
    // entire system that makes a category of policy structurally impossible to
    // express, rather than merely unlikely to be reached. See enforceBounded.
    if (effect === "ALLOW_AUTO" && ceiling === null) {
      rejections.push({
        clause: fragment,
        reason:
          "This would permit unattended spending with no upper limit. Add an " +
          "amount ceiling — for example, “up to $500” — and compile again.",
      });
      continue;
    }

    const ordinal =
      typeof raw.ordinal === "number" && Number.isInteger(raw.ordinal)
        ? raw.ordinal
        : rules.length + 1;

    rules.push({
      id: `rule_${ordinal}`,
      ordinal,
      effect: effect as RuleEffect,
      conditions,
      amountCeiling: ceiling as number | null,
      currency: "USD",
      sourceFragment: fragment,
      description:
        typeof raw.description === "string" && raw.description.trim()
          ? raw.description
          : fragment,
    });
  }

  if (rejections.length > 0) {
    // Partial compilation is never returned as a success. The user sees what
    // was understood and what was not, and decides.
    return { ok: false, sourceText, understood: rules, rejections };
  }

  return { ok: true, sourceText, rules: sortRules(rules) };
}

/** Deterministic order: ordinal, then id. Row order never decides anything. */
export function sortRules(rules: PolicyRule[]): PolicyRule[] {
  return [...rules].sort((a, b) =>
    a.ordinal !== b.ordinal
      ? a.ordinal - b.ordinal
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0,
  );
}
