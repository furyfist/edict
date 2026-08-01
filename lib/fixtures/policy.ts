import { cents } from "../contracts/money";
import { terminalRule } from "../contracts/policy";
import type { Policy, PolicyRule, Verdict } from "../contracts";

/** Deterministic policy and verdict fixtures. */

/**
 * The canonical demo policy. Kept identical to the seeded policy in
 * lib/db/seed.ts so the interface, the tests, and the running system all cite
 * the same sentences.
 */
export const FIXTURE_POLICY_TEXT = [
  "Never auto-renew Vercel.",
  "Auto-renew anything under $500 a month.",
  "Anything over $500 a month needs my approval.",
].join(" ");

export function makePolicyRules(): PolicyRule[] {
  const rules: PolicyRule[] = [
    {
      id: "rule-never-vercel",
      ordinal: 0,
      effect: "DENY",
      scope: { kind: "VENDOR", vendorId: "vendor-vercel" },
      conditions: {},
      sourceFragment: "Never auto-renew Vercel.",
    },
    {
      id: "rule-auto-under-500",
      ordinal: 1,
      effect: "ALLOW_AUTO",
      scope: { kind: "ANY" },
      conditions: { maxAmountCents: cents(50000) },
      sourceFragment: "Auto-renew anything under $500 a month.",
    },
    {
      id: "rule-approve-over-500",
      ordinal: 2,
      effect: "REQUIRE_APPROVAL",
      scope: { kind: "ANY" },
      conditions: {},
      sourceFragment: "Anything over $500 a month needs my approval.",
    },
  ];
  return [...rules, terminalRule(rules.length)];
}

export function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: "policy-v1",
    version: 1,
    englishText: FIXTURE_POLICY_TEXT,
    rules: makePolicyRules(),
    status: "ACTIVE",
    compiledAt: "2026-02-28T10:00:00.000Z",
    activatedAt: "2026-02-28T10:02:00.000Z",
    ...overrides,
  };
}

export function makeVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    effect: "ALLOW_AUTO",
    matchedRuleId: "rule-auto-under-500",
    matchedRuleOrdinal: 1,
    matchedSourceFragment:
      "Auto-renew anything under $500 a month if usage is above 60%.",
    code: "RULE_MATCHED",
    ...overrides,
  };
}
