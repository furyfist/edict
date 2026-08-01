import { ACTIONS, EFFECTS, FREQUENCIES } from "../../contracts";

/**
 * The policy compiler prompt.
 *
 * This is the front door to the whole product: the user's own sentence becomes
 * a constraint the card network enforces. It is also the most dangerous
 * component here — a compiler that silently mis-reads authority grants power
 * nobody agreed to.
 *
 * Two mitigations, both structural rather than prompt-based:
 *
 *  1. Every rule must quote the span of text it came from, verbatim. Verified
 *     deterministically after the model returns. A rule with no textual origin
 *     is rejected, so the compiler cannot invent authority out of nothing.
 *
 *  2. The compiled policy is INERT until a human confirms it. The model's
 *     output is a proposal here too.
 */

export const COMPILER_PROMPT_VERSION = "v1";

export const COMPILER_SYSTEM_PROMPT = `You convert a spending policy written in plain English into an ordered list of structured rules.

Each rule has:
- effect: ${EFFECTS.join(" | ")}
- scope: which vendors it applies to — a named vendor, a category, or everything
- conditions: optional limits (maximum amount in cents, minimum active-seat percentage, billing frequency, days until renewal)
- sourceFragment: THE EXACT SPAN OF THE USER'S TEXT this rule came from, copied character for character

Hard requirements:
1. sourceFragment must be copied VERBATIM from the input. Do not paraphrase, reword, correct spelling, or fix punctuation. If you cannot quote it exactly, do not emit the rule.
2. Order rules the way the user stated them. Put prohibitions ("never", "don't", "under no circumstances") first.
3. Any rule with effect ALLOW_AUTO MUST include maxAmountCents. Unbounded automatic approval is not permitted. If the user asks to auto-approve something without naming a limit, emit REQUIRE_APPROVAL instead.
4. Amounts are integer US cents. "$500" is 50000.
5. Only reference vendors from the provided list, using their exact id.
6. If a clause cannot be expressed with these fields — conditional logic across vendors, times of day, named approvers, chained approvals — do not guess. List it in unsupportedClauses with the exact text.

HOW RULES ARE EVALUATED — this determines how you should express a policy:
Every DENY rule is checked first, so prohibitions always win regardless of position. Then the remaining rules are checked in order and the FIRST match wins. So a broad "everything else needs approval" clause is expressible: emit REQUIRE_APPROVAL with scopeKind ANY and no conditions, placed after the narrower rules. It only catches what earlier rules did not.

Worked example.
Input: "Never auto-renew Vercel. Auto-renew anything under $500 a month. Anything over $500 a month needs my approval."
Correct output — three rules, nothing unsupported:
  1. DENY, scopeKind VENDOR (Vercel), sourceFragment "Never auto-renew Vercel."
  2. ALLOW_AUTO, scopeKind ANY, maxAmountCents 50000, sourceFragment "Auto-renew anything under $500 a month."
  3. REQUIRE_APPROVAL, scopeKind ANY, no conditions, sourceFragment "Anything over $500 a month needs my approval."
Rule 3 needs no amount condition: anything at or under $500 already matched rule 2, so rule 3 catches exactly the remainder. Do NOT report a clause like this as unsupported.

Reserve unsupportedClauses for things genuinely outside the schema: named people, weekday/time conditions, multi-step approval chains, or limits on anything other than amount, seat usage, billing frequency, and days-until-renewal.

Emit nothing you cannot ground in the user's words.`;

export function buildCompilerUserPrompt(input: {
  englishText: string;
  vendors: Array<{ id: string; name: string; category: string }>;
}): string {
  const vendorLines = input.vendors
    .map((vendor) => `  - id: ${vendor.id} | name: ${vendor.name} | category: ${vendor.category}`)
    .join("\n");

  return `KNOWN VENDORS
${vendorLines || "  (none)"}

ALLOWED ACTIONS (for reference only; rules govern effects, not actions)
  ${ACTIONS.join(", ")}

ALLOWED FREQUENCIES
  ${FREQUENCIES.join(", ")}

THE USER'S POLICY TEXT — quote sourceFragment verbatim from this
"""
${input.englishText}
"""

Compile it.`;
}

export const COMPILER_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["rules", "unsupportedClauses"],
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        // Strict structured outputs require EVERY property to appear in
        // `required`. Optionality is expressed by admitting null in the type,
        // not by omitting the key — a schema that leaves optional fields out
        // of `required` is rejected outright with a 400, by OpenAI and by
        // OpenAI-compatible providers alike. The validator downstream treats
        // null and absent identically, so this costs nothing.
        required: [
          "effect",
          "scopeKind",
          "scopeVendorId",
          "scopeCategory",
          "maxAmountCents",
          "minActiveSeatPct",
          "frequency",
          "renewalWithinDays",
          "sourceFragment",
        ],
        properties: {
          effect: { type: "string", enum: [...EFFECTS] },
          scopeKind: { type: "string", enum: ["VENDOR", "CATEGORY", "ANY"] },
          scopeVendorId: { type: ["string", "null"] },
          scopeCategory: { type: ["string", "null"] },
          maxAmountCents: { type: ["integer", "null"] },
          minActiveSeatPct: { type: ["integer", "null"] },
          frequency: { type: ["string", "null"], enum: [...FREQUENCIES, null] },
          renewalWithinDays: { type: ["integer", "null"] },
          sourceFragment: { type: "string" },
        },
      },
    },
    unsupportedClauses: {
      type: "array",
      items: { type: "string" },
    },
  },
};
