import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import type {
  EngineEvidence,
  EngineInput,
  EngineProposal,
  PolicyRule,
} from "./types";

/**
 * Precedence and ordering.
 *
 * The two-pass property is the one an adversary probes first: write a
 * permissive rule at the top of the policy and see whether it defeats a
 * prohibition further down. These tests verify the property rather than
 * asserting it in a comment.
 */

function evidence(over: Partial<EngineEvidence> = {}): EngineEvidence {
  return {
    bundleId: "bundle_1",
    vendor: { id: "vendor_figma", name: "Figma", category: "design" },
    renewal: { id: "renewal_1", amount: { cents: 45_00, currency: "USD" } },
    seats: { licensed: 20, active: 18, dormant: 2 },
    priceChange: null,
    gaps: [],
    ...over,
  };
}

function proposal(over: Partial<EngineProposal> = {}): EngineProposal {
  return {
    proposalId: "proposal_1",
    bundleId: "bundle_1",
    renewalId: "renewal_1",
    action: "RENEW",
    amount: { cents: 45_00, currency: "USD" },
    ...over,
  };
}

function rule(over: Partial<PolicyRule> & { id: string }): PolicyRule {
  return {
    ordinal: 1,
    effect: "ALLOW_AUTO",
    conditions: [],
    amountCeiling: 100_00,
    currency: "USD",
    sourceFragment: "fragment",
    description: "description",
    ...over,
  };
}

function run(rules: PolicyRule[], over: Partial<EngineInput> = {}) {
  return evaluate({
    evidence: evidence(),
    proposal: proposal(),
    rules,
    policyVersionId: "policy_1",
    ...over,
  });
}

describe("two-pass precedence", () => {
  it("a DENY at a high ordinal defeats an ALLOW_AUTO at a low one", () => {
    const verdict = run([
      rule({ id: "allow_early", ordinal: 1, effect: "ALLOW_AUTO" }),
      rule({
        id: "deny_late",
        ordinal: 9,
        effect: "DENY",
        conditions: [{ field: "VENDOR_ID", operator: "EQ", value: "vendor_figma" }],
      }),
    ]);

    expect(verdict.decision).toBe("DENY");
    expect(verdict.reason).toBe("DENIAL_PASS");
    expect(verdict.citedRuleId).toBe("deny_late");
  });

  it("a DENY defeats an ALLOW_AUTO regardless of the order rules arrive in", () => {
    const allow = rule({ id: "allow_early", ordinal: 1 });
    const deny = rule({ id: "deny_late", ordinal: 9, effect: "DENY" });

    const forwards = run([allow, deny]);
    const backwards = run([deny, allow]);

    expect(forwards.decision).toBe("DENY");
    expect(backwards.decision).toBe("DENY");
    expect(forwards).toEqual(backwards);
  });

  it("cites the lowest-ordinal matching DENY when several match", () => {
    const verdict = run([
      rule({ id: "deny_b", ordinal: 7, effect: "DENY" }),
      rule({ id: "deny_a", ordinal: 3, effect: "DENY" }),
    ]);

    expect(verdict.citedRuleId).toBe("deny_a");
  });

  it("within the permissive pass, the first match wins", () => {
    const verdict = run([
      rule({ id: "escalate_first", ordinal: 2, effect: "REQUIRE_APPROVAL" }),
      rule({ id: "allow_second", ordinal: 5, effect: "ALLOW_AUTO" }),
    ]);

    expect(verdict.decision).toBe("REQUIRE_APPROVAL");
    expect(verdict.citedRuleId).toBe("escalate_first");
  });

  it("a non-matching DENY does not block a matching ALLOW_AUTO", () => {
    const verdict = run([
      rule({
        id: "deny_other_vendor",
        ordinal: 1,
        effect: "DENY",
        conditions: [{ field: "VENDOR_ID", operator: "EQ", value: "vendor_other" }],
      }),
      rule({ id: "allow_all", ordinal: 2, effect: "ALLOW_AUTO" }),
    ]);

    expect(verdict.decision).toBe("ALLOW_AUTO");
    expect(verdict.citedRuleId).toBe("allow_all");
  });
});

describe("determinism", () => {
  it("ties on ordinal are broken by rule id, not by input order", () => {
    const a = rule({ id: "aaa", ordinal: 4, effect: "REQUIRE_APPROVAL" });
    const b = rule({ id: "bbb", ordinal: 4, effect: "ALLOW_AUTO" });

    expect(run([a, b]).citedRuleId).toBe("aaa");
    expect(run([b, a]).citedRuleId).toBe("aaa");
  });

  it("the same input produces the same verdict every time", () => {
    const rules = [
      rule({ id: "r1", ordinal: 1, effect: "REQUIRE_APPROVAL" }),
      rule({ id: "r2", ordinal: 2, effect: "DENY" }),
    ];
    const first = run(rules);
    for (let i = 0; i < 25; i += 1) {
      expect(run(rules)).toEqual(first);
    }
  });

  it("evaluation does not mutate the rules it is given", () => {
    const rules = [
      rule({ id: "z", ordinal: 9 }),
      rule({ id: "a", ordinal: 1, effect: "DENY" }),
    ];
    const snapshot = JSON.parse(JSON.stringify(rules));
    run(rules);
    expect(rules).toEqual(snapshot);
  });
});

describe("citation", () => {
  it("every verdict cites exactly one rule, including the default", () => {
    const matched = run([rule({ id: "r1" })]);
    const defaulted = run([]);

    expect(matched.citedRuleId).toBe("r1");
    expect(defaulted.citedRuleId).toBe("terminal-default");
    expect(defaulted.citedRuleId).toBeTruthy();
  });

  it("carries the source fragment of the cited rule", () => {
    const verdict = run([
      rule({
        id: "r1",
        effect: "DENY",
        sourceFragment: "Never renew anything from CloudSync Pro.",
      }),
    ]);

    expect(verdict.citedSourceFragment).toBe(
      "Never renew anything from CloudSync Pro.",
    );
  });
});
