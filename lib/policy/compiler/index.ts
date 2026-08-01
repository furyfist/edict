import { complete } from "../../agent/client";
import { terminalRule } from "../../contracts/policy";
import type { PolicyRule } from "../../contracts";
import {
  COMPILER_JSON_SCHEMA,
  COMPILER_SYSTEM_PROMPT,
  buildCompilerUserPrompt,
} from "./prompt";

/**
 * The policy compiler: English in, structured rules out.
 *
 * The output of this module is INERT. It is a draft with no id, no version, and
 * no effect on anything, and it stays that way until a human looks at the rules
 * beside their own sentences and confirms. Auto-activating a compiled policy
 * would put a language model directly in the authorization path, which is the
 * one thing this architecture exists to prevent.
 *
 * Validation is deterministic and lives in ./validate. The model proposes; plain
 * code decides whether the proposal is admissible.
 */

export interface RawCompiledRule {
  effect: string;
  scopeKind: string;
  scopeVendorId?: string | null;
  scopeCategory?: string | null;
  maxAmountCents?: number | null;
  minActiveSeatPct?: number | null;
  frequency?: string | null;
  renewalWithinDays?: number | null;
  sourceFragment: string;
}

export interface PolicyDraft {
  englishText: string;
  /** Ordered, with the terminal default appended. */
  rules: PolicyRule[];
  /** Clauses the model could not express. Surfaced, never silently dropped. */
  unsupportedClauses: string[];
}

export interface CompileError {
  /** The offending text, when it can be identified. */
  clause?: string;
  message: string;
}

export type CompileResult =
  | { ok: true; draft: PolicyDraft }
  | {
      ok: false;
      errors: CompileError[];
      /**
       * What WAS understood, shown alongside the rejection.
       *
       * Silent partial compilation is the worst failure this component has, so
       * a rejection always shows its work: here is what we read, here is the
       * clause we could not.
       */
      understood: PolicyRule[];
      unsupportedClauses: string[];
    };

export interface CompileInput {
  englishText: string;
  vendors: Array<{ id: string; name: string; category: string }>;
}

export async function compilePolicy(
  input: CompileInput,
): Promise<CompileResult> {
  const text = input.englishText.trim();

  if (text.length === 0) {
    return {
      ok: false,
      errors: [{ message: "Policy text is empty." }],
      understood: [],
      unsupportedClauses: [],
    };
  }

  const response = await complete({
    system: COMPILER_SYSTEM_PROMPT,
    user: buildCompilerUserPrompt({ englishText: text, vendors: input.vendors }),
    schemaName: "compiled_policy",
    jsonSchema: COMPILER_JSON_SCHEMA,
  });

  if (!response.ok) {
    return {
      ok: false,
      errors: [
        {
          message:
            response.failure.kind === "UNAVAILABLE"
              ? `Could not reach the compiler: ${response.failure.message}`
              : response.failure.message,
        },
      ],
      understood: [],
      unsupportedClauses: [],
    };
  }

  let parsed: { rules?: unknown; unsupportedClauses?: unknown };
  try {
    parsed = JSON.parse(response.content);
  } catch {
    return {
      ok: false,
      errors: [{ message: "Compiler output was not valid JSON." }],
      understood: [],
      unsupportedClauses: [],
    };
  }

  const { validateCompiledRules } = await import("./validate");
  return validateCompiledRules({
    englishText: text,
    rawRules: Array.isArray(parsed.rules) ? (parsed.rules as RawCompiledRule[]) : [],
    unsupportedClauses: Array.isArray(parsed.unsupportedClauses)
      ? (parsed.unsupportedClauses as string[])
      : [],
    vendors: input.vendors,
  });
}

/** Appends the terminal default. Never compiled from text — always added. */
export function withTerminalRule(rules: PolicyRule[]): PolicyRule[] {
  return [...rules, terminalRule(rules.length)];
}

export { validateCompiledRules, containsFragment } from "./validate";
export {
  COMPILER_PROMPT_VERSION,
  COMPILER_SYSTEM_PROMPT,
  buildCompilerUserPrompt,
} from "./prompt";
