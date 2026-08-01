import { describe, expect, it } from "vitest";
import { evaluate } from "./index";
import { cents } from "../../contracts/money";
import { terminalRule } from "../../contracts/policy";
import type { Policy, PolicyRule } from "../../contracts";
import { makeEvidenceBundle } from "../../fixtures/evidence";
import { makeProposal } from "../../fixtures/proposal";

/**
 * Precedence and ordering.
 *
 * The property under test is the reason the engine evaluates in two passes: a
 * prohibition must hold regardless of where it was written. If this file ever
 * goes red, the product's central claim is false.
 */

function policyOf(rules: PolicyRule[]): Policy {
  return {
    id: "policy-test",
    version: 1,
    englishText: "(test)",
    rules: [...rules, terminalRule(rules.length + 100)],
    status: "ACTIVE",
    compiledAt: "2026-03-01T00:00:00.000Z",
    activatedAt: "2026-03-01T00:00:00.000Z",
  };
}

const allowEverything: PolicyRule = {
  id: "allow-all",
  ordinal: 1,
  effect: "ALLOW_AUTO",
  scope: { kind: "ANY" },
  conditions: { maxAmountCents: cents(1_000_000) },
  sourceFragment: "Auto-renew anything.",
};

const denyThisVendor: PolicyRule = {
  id: "deny-figma",
  ordinal: 9,
  effect: "DENY",
  scope: { kind: "VENDOR", vendorId: "vendor-figma" },
  conditions: {},
  sourceFragment: "Never auto-renew Figma.",
};

describe("prohibitions are absolute", () => {
  it("a DENY at ordinal 9 defeats an ALLOW_AUTO at ordinal 1", () => {
    const verdict = evaluate({
      proposal: makeProposal(),
      evidence: makeEvidenceBundle(),
      policy: policyOf([allowEverything, denyThisVendor]),
    });

    expect(verdict.effect).toBe("DENY");
    expect(verdict.matchedRuleId).toBe("deny-figma");
  });

  it("holds when the rules are supplied in the opposite array order", () => {
    // Ordinal is what matters, not array position. The engine sorts.
    const verdict = evaluate({
      proposal: makeProposal(),
      evidence: makeEvidenceBundle(),
      policy: policyOf([denyThisVendor, allowEverything]),
    });

    expect(verdict.effect).toBe("DENY");
    expect(verdict.matchedRuleId).toBe("deny-figma");
  });

  it("a DENY beats a REQUIRE_APPROVAL that would otherwise have matched first", () => {
    const approveFirst: PolicyRule = {
      id: "approve-all",
      ordinal: 0,
      effect: "REQUIRE_APPROVAL",
      scope: { kind: "ANY" },
      conditions: {},
      sourceFragment: "Ask me about everything.",
    };

    const verdict = evaluate({
      proposal: makeProposal(),
      evidence: makeEvidenceBundle(),
      policy: policyOf([approveFirst, denyThisVendor]),
    });

    expect(verdict.effect).toBe("DENY");
  });

  it("a DENY scoped to another vendor does not fire", () => {
    const denyOther: PolicyRule = {
      ...denyThisVendor,
      id: "deny-vercel",
      scope: { kind: "VENDOR", vendorId: "vendor-vercel" },
    };

    const verdict = evaluate({
      proposal: makeProposal(),
      evidence: makeEvidenceBundle(),
      policy: policyOf([allowEverything, denyOther]),
    });

    expect(verdict.effect).toBe("ALLOW_AUTO");
  });
});

describe("first match wins among non-DENY rules", () => {
  it("selects the lowest ordinal when two rules both match", () => {
    const approveLater: PolicyRule = {
      id: "approve-later",
      ordinal: 5,
      effect: "REQUIRE_APPROVAL",
      scope: { kind: "ANY" },
      conditions: {},
      sourceFragment: "Ask me.",
    };

    const verdict = evaluate({
      proposal: makeProposal(),
      evidence: makeEvidenceBundle(),
      policy: policyOf([allowEverything, approveLater]),
    });

    expect(verdict.effect).toBe("ALLOW_AUTO");
    expect(verdict.matchedRuleOrdinal).toBe(1);
  });

  it("falls through a rule whose conditions do not hold", () => {
    const tightCeiling: PolicyRule = {
      ...allowEverything,
      id: "allow-tiny",
      ordinal: 1,
      conditions: { maxAmountCents: cents(100) },
    };
    const approveRest: PolicyRule = {
      id: "approve-rest",
      ordinal: 2,
      effect: "REQUIRE_APPROVAL",
      scope: { kind: "ANY" },
      conditions: {},
      sourceFragment: "Ask me about the rest.",
    };

    const verdict = evaluate({
      proposal: makeProposal({ amountCents: cents(9000) }),
      evidence: makeEvidenceBundle(),
      policy: policyOf([tightCeiling, approveRest]),
    });

    expect(verdict.effect).toBe("REQUIRE_APPROVAL");
    expect(verdict.matchedRuleId).toBe("approve-rest");
  });

  it("matches a category-scoped rule", () => {
    const byCategory: PolicyRule = {
      id: "allow-design",
      ordinal: 1,
      effect: "ALLOW_AUTO",
      scope: { kind: "CATEGORY", category: "design" },
      conditions: { maxAmountCents: cents(50000) },
      sourceFragment: "Auto-renew design tools under $500.",
    };

    const verdict = evaluate({
      proposal: makeProposal(),
      evidence: makeEvidenceBundle(),
      policy: policyOf([byCategory]),
    });

    expect(verdict.effect).toBe("ALLOW_AUTO");
    expect(verdict.matchedRuleId).toBe("allow-design");
  });
});

describe("every verdict cites exactly one rule", () => {
  const cases: Array<[string, Policy]> = [
    ["allow", policyOf([allowEverything])],
    ["deny", policyOf([denyThisVendor])],
    ["nothing matches", policyOf([])],
  ];

  for (const [name, policy] of cases) {
    it(`cites a rule for: ${name}`, () => {
      const verdict = evaluate({
        proposal: makeProposal(),
        evidence: makeEvidenceBundle(),
        policy,
      });

      expect(verdict.matchedRuleId).toBeTruthy();
      expect(typeof verdict.matchedRuleOrdinal).toBe("number");
      expect(verdict.matchedSourceFragment).toBeTruthy();
    });
  }
});

describe("determinism", () => {
  it("returns an identical verdict across repeated evaluations", () => {
    const input = {
      proposal: makeProposal(),
      evidence: makeEvidenceBundle(),
      policy: policyOf([allowEverything, denyThisVendor]),
    };

    const first = evaluate(input);
    for (let i = 0; i < 50; i++) {
      expect(evaluate(input)).toEqual(first);
    }
  });

  it("does not mutate its inputs", () => {
    const policy = policyOf([denyThisVendor, allowEverything]);
    const snapshot = JSON.stringify(policy);

    evaluate({
      proposal: makeProposal(),
      evidence: makeEvidenceBundle(),
      policy,
    });

    expect(JSON.stringify(policy)).toBe(snapshot);
  });
});
