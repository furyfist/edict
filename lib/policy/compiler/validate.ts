import { EFFECTS, FREQUENCIES } from "../../contracts";
import type { Cents, Effect, Frequency, PolicyRule, RuleScope } from "../../contracts";
import { hasUnboundedAuthority, terminalRule } from "../../contracts/policy";
import type { CompileError, CompileResult, RawCompiledRule } from "./index";

/**
 * Deterministic validation of compiled rules.
 *
 * The model proposes; this decides. Nothing here calls a model, so the question
 * "is this policy admissible?" always has the same answer for the same input.
 *
 * The most important check is `containsFragment`. Every rule must quote the
 * user's text verbatim, which means the compiler cannot conjure authority the
 * user never expressed — it can only point at words they actually wrote.
 */

/** Whitespace-and-case tolerant containment. Not a paraphrase check. */
export function containsFragment(text: string, fragment: string): boolean {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[\s ]+/g, " ").trim();

  const haystack = normalize(text);
  const needle = normalize(fragment);
  if (needle.length === 0) return false;
  return haystack.includes(needle);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateCompiledRules(input: {
  englishText: string;
  rawRules: RawCompiledRule[];
  unsupportedClauses: string[];
  vendors: Array<{ id: string; name: string; category: string }>;
}): CompileResult {
  const errors: CompileError[] = [];
  const understood: PolicyRule[] = [];
  const vendorIds = new Set(input.vendors.map((vendor) => vendor.id));
  const categories = new Set(input.vendors.map((vendor) => vendor.category));

  if (input.rawRules.length === 0) {
    errors.push({
      message: "No rules could be derived from this policy text.",
    });
  }

  input.rawRules.forEach((raw, index) => {
    const clause = raw.sourceFragment;
    const reject = (message: string) => errors.push({ clause, message });

    if (!(EFFECTS as readonly string[]).includes(raw.effect)) {
      reject(`Unknown effect "${raw.effect}".`);
      return;
    }

    // Provenance. A rule with no textual origin is not admissible.
    if (typeof clause !== "string" || clause.trim().length === 0) {
      reject("Rule does not quote any of your text.");
      return;
    }
    if (!containsFragment(input.englishText, clause)) {
      reject(
        `Rule quotes "${clause}", which does not appear in your policy text.`,
      );
      return;
    }

    let scope: RuleScope;
    switch (raw.scopeKind) {
      case "VENDOR": {
        const vendorId = raw.scopeVendorId ?? "";
        if (!vendorIds.has(vendorId)) {
          reject(`References unknown vendor "${vendorId}".`);
          return;
        }
        scope = { kind: "VENDOR", vendorId };
        break;
      }
      case "CATEGORY": {
        const category = raw.scopeCategory ?? "";
        if (category.trim().length === 0) {
          reject("Category scope is empty.");
          return;
        }
        if (!categories.has(category)) {
          reject(`References unknown category "${category}".`);
          return;
        }
        scope = { kind: "CATEGORY", category };
        break;
      }
      case "ANY":
        scope = { kind: "ANY" };
        break;
      default:
        reject(`Unknown scope "${raw.scopeKind}".`);
        return;
    }

    const conditions: PolicyRule["conditions"] = {};

    if (raw.maxAmountCents !== null && raw.maxAmountCents !== undefined) {
      if (!isPositiveInteger(raw.maxAmountCents)) {
        reject("Maximum amount must be a positive whole number of cents.");
        return;
      }
      conditions.maxAmountCents = raw.maxAmountCents as Cents;
    }

    if (raw.minActiveSeatPct !== null && raw.minActiveSeatPct !== undefined) {
      const pct = raw.minActiveSeatPct;
      if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
        reject("Usage percentage must be a whole number between 0 and 100.");
        return;
      }
      conditions.minActiveSeatPct = pct;
    }

    if (raw.frequency !== null && raw.frequency !== undefined) {
      if (!(FREQUENCIES as readonly string[]).includes(raw.frequency)) {
        reject(`Unknown billing frequency "${raw.frequency}".`);
        return;
      }
      conditions.frequency = raw.frequency as Frequency;
    }

    if (raw.renewalWithinDays !== null && raw.renewalWithinDays !== undefined) {
      if (!isPositiveInteger(raw.renewalWithinDays)) {
        reject("Renewal window must be a positive whole number of days.");
        return;
      }
      conditions.renewalWithinDays = raw.renewalWithinDays;
    }

    const rule: PolicyRule = {
      id: `rule-${index}`,
      ordinal: index,
      effect: raw.effect as Effect,
      scope,
      conditions,
      sourceFragment: clause.trim(),
    };

    // Unbounded autonomy is not discouraged — it is uncompilable.
    //
    // Enforced here, where authority is CREATED, rather than downstream where
    // it would be spent. An ALLOW_AUTO rule with no ceiling would let the agent
    // approve any amount for anything matching its scope, and no amount of
    // care further down the pipeline can undo having granted that.
    if (hasUnboundedAuthority(rule)) {
      reject(
        "This would let the agent approve any amount automatically. Give it a limit, for example \"under $500 a month\".",
      );
      return;
    }

    understood.push(rule);
  });

  // Unsupported clauses are surfaced, never silently dropped. A policy that
  // half-compiled without saying so is worse than one that refused outright.
  for (const clause of input.unsupportedClauses) {
    errors.push({
      clause,
      message: "This cannot be expressed as a rule. Rewrite it or remove it.",
    });
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      understood,
      unsupportedClauses: input.unsupportedClauses,
    };
  }

  return {
    ok: true,
    draft: {
      englishText: input.englishText,
      rules: [...understood, terminalRule(understood.length)],
      unsupportedClauses: [],
    },
  };
}
