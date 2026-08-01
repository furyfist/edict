import { complete, truncate } from "../../agent/client";
import {
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  RULE_EFFECTS,
  type PolicyRule,
} from "../../contracts";
import { validateCompilation } from "./validate";

/**
 * The policy compiler.
 *
 * English in, an ordered array of rules out. This is the differentiator: the
 * authority the system acts under originates in sentences the user wrote,
 * and every compiled rule carries the fragment of English it came from, so a
 * refusal can quote the user's own words back to them.
 *
 * The compiler is not in the authorization path. It produces an inert draft
 * that has no force until a human confirms it. That is the property that keeps
 * the model out of authority even though the model is what reads the English.
 *
 * The failure this component must never have is silent partial compilation —
 * quietly dropping a clause it did not understand, leaving the user believing
 * a rule is enforced when nothing enforces it. Every validation below exists
 * to convert that silence into a visible rejection.
 */

export interface CompilerRejection {
  /** The clause that could not be compiled, quoted from the input. */
  clause: string;
  reason: string;
}

export interface CompileSuccess {
  ok: true;
  rules: PolicyRule[];
  /** What the compiler believes each rule means, for human review. */
  sourceText: string;
}

export interface CompileFailure {
  ok: false;
  rejections: CompilerRejection[];
  /** Rules that did compile, shown so the user sees what was understood. */
  understood: PolicyRule[];
  sourceText: string;
}

export type CompileResult = CompileSuccess | CompileFailure;

const SYSTEM_PROMPT = `You compile English spending policy into structured rules.

Each sentence becomes zero or one rule. Output an ordered array. Order matters:
lower ordinals are considered first within each evaluation pass.

Effects:
  DENY             — never permitted, under any circumstance
  REQUIRE_APPROVAL — permitted only with a human's explicit approval
  ALLOW_AUTO       — permitted unattended, up to an amount ceiling

Condition fields:
  AMOUNT                            integer cents
  VENDOR_ID                         string
  VENDOR_CATEGORY                   string
  PRICE_INCREASE_BASIS_POINTS       integer, 1500 = 15%
  DORMANT_SEAT_COUNT                integer
  DORMANT_SEAT_RATIO_BASIS_POINTS   integer, 2500 = 25%
  ACTION                            one of RENEW, RENEW_REDUCED_SEATS, PAUSE, CANCEL, ESCALATE
  EVIDENCE_GAP                      one of NO_USAGE_DATA, NO_PRIOR_INVOICE, NO_CONTRACT_TERMS, STALE_USAGE_DATA, UNKNOWN_VENDOR

Operators: LTE, LT, GTE, GT, EQ, NEQ, IN, NOT_IN, PRESENT, ABSENT

Hard requirements:
  - Every ALLOW_AUTO rule MUST have a non-null amountCeilingCents. A rule
    permitting unattended spending without a ceiling is unbounded authority and
    must never be produced. If a sentence asks for one, do not compile it —
    report it as unsupported instead.
  - sourceFragment MUST be an exact substring of the input text, copied
    character for character. Do not paraphrase it.
  - If a sentence cannot be expressed with the fields and operators above,
    do not approximate it. List it in "unsupported" with a reason.

Money is always integer cents: $50 is 5000.

Respond with a single JSON object:
{"rules": [{"ordinal": 1, "effect": "...", "conditions": [...],
            "amountCeilingCents": null, "sourceFragment": "...",
            "description": "..."}],
 "unsupported": [{"clause": "...", "reason": "..."}]}`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ordinal: { type: "integer" },
          effect: { type: "string", enum: [...RULE_EFFECTS] },
          conditions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                field: { type: "string", enum: [...CONDITION_FIELDS] },
                operator: { type: "string", enum: [...CONDITION_OPERATORS] },
                value: {},
              },
              required: ["field", "operator"],
              additionalProperties: false,
            },
          },
          amountCeilingCents: { type: ["integer", "null"] },
          sourceFragment: { type: "string" },
          description: { type: "string" },
        },
        required: [
          "ordinal",
          "effect",
          "conditions",
          "amountCeilingCents",
          "sourceFragment",
          "description",
        ],
        additionalProperties: false,
      },
    },
    unsupported: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clause: { type: "string" },
          reason: { type: "string" },
        },
        required: ["clause", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["rules", "unsupported"],
  additionalProperties: false,
} as const;

export async function compilePolicy(
  sourceText: string,
): Promise<CompileResult> {
  const trimmed = sourceText.trim();

  if (trimmed.length === 0) {
    return {
      ok: false,
      sourceText,
      understood: [],
      rejections: [
        {
          clause: "",
          reason: "The policy text is empty. There is nothing to compile.",
        },
      ],
    };
  }

  const result = await complete({
    system: SYSTEM_PROMPT,
    prompt: trimmed,
    maxTokens: 4096,
    schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
  });

  if (!result.ok) {
    return {
      ok: false,
      sourceText,
      understood: [],
      rejections: [
        {
          clause: trimmed,
          reason: `The policy could not be compiled: ${result.detail}`,
        },
      ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    return {
      ok: false,
      sourceText,
      understood: [],
      rejections: [
        {
          clause: trimmed,
          reason: "The compiler returned a response that was not valid JSON.",
        },
      ],
    };
  }

  return validateCompilation(parsed, trimmed);
}
