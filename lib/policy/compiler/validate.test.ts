import { describe, expect, it } from "vitest";
import { validateCompilation } from "./validate";

/**
 * The compiler's rejection surface.
 *
 * The property under test: a policy either compiles completely or it does not
 * compile. There is no partial success, because a partially compiled policy is
 * the failure mode where the user believes a rule is enforced and nothing
 * enforces it.
 */

const SOURCE = [
  "Renew anything under $100 automatically.",
  "Never renew anything from CloudSync Pro.",
  "Anything over $500 needs my approval.",
].join("\n");

function rule(overrides: Record<string, unknown> = {}) {
  return {
    ordinal: 1,
    effect: "ALLOW_AUTO",
    conditions: [{ field: "AMOUNT", operator: "LTE", value: 10_000 }],
    amountCeilingCents: 10_000,
    sourceFragment: "Renew anything under $100 automatically.",
    description: "Auto-renew at or below $100.00.",
    ...overrides,
  };
}

function compile(rules: unknown[], unsupported: unknown[] = []) {
  return validateCompilation({ rules, unsupported }, SOURCE);
}

describe("a complete compilation succeeds", () => {
  it("accepts well-formed rules that trace to the source", () => {
    const result = compile([rule()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rules).toHaveLength(1);
      expect(result.rules[0].amountCeiling).toBe(10_000);
    }
  });

  it("orders rules by ordinal deterministically", () => {
    const result = compile([
      rule({
        ordinal: 3,
        effect: "REQUIRE_APPROVAL",
        amountCeilingCents: null,
        sourceFragment: "Anything over $500 needs my approval.",
      }),
      rule({
        ordinal: 1,
        effect: "DENY",
        amountCeilingCents: null,
        sourceFragment: "Never renew anything from CloudSync Pro.",
      }),
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rules.map((r) => r.ordinal)).toEqual([1, 3]);
    }
  });
});

describe("unbounded auto-approval cannot be compiled", () => {
  it("rejects an ALLOW_AUTO rule with no amount ceiling", () => {
    const result = compile([rule({ amountCeilingCents: null })]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections).toHaveLength(1);
      expect(result.rejections[0].reason).toMatch(/no upper limit/i);
      // The rejection names the clause and says how to fix it.
      expect(result.rejections[0].clause).toBe(
        "Renew anything under $100 automatically.",
      );
      expect(result.rejections[0].reason).toMatch(/amount ceiling/i);
    }
  });

  it("still permits DENY and REQUIRE_APPROVAL without a ceiling", () => {
    // Only unattended spending needs a bound. A denial has nothing to bound.
    const result = compile([
      rule({
        effect: "DENY",
        amountCeilingCents: null,
        sourceFragment: "Never renew anything from CloudSync Pro.",
      }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("rejects the whole policy when one rule is unbounded", () => {
    const result = compile([
      rule(),
      rule({
        ordinal: 2,
        amountCeilingCents: null,
        sourceFragment: "Anything over $500 needs my approval.",
      }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The bounded rule is shown as understood, but the policy does not
      // compile — the user decides, not the compiler.
      expect(result.understood).toHaveLength(1);
      expect(result.rejections).toHaveLength(1);
    }
  });
});

describe("rules must trace to text the user wrote", () => {
  it("rejects a rule citing text absent from the policy", () => {
    const result = compile([
      rule({ sourceFragment: "Approve everything from Acme Corp." }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections[0].reason).toMatch(/does not appear/i);
    }
  });

  it("rejects a rule with no source fragment", () => {
    const result = compile([rule({ sourceFragment: "" })]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections[0].reason).toMatch(/cannot be traced/i);
    }
  });
});

describe("unsupported clauses are surfaced, never dropped", () => {
  it("reports a clause the compiler could not express", () => {
    const result = compile(
      [rule()],
      [
        {
          clause: "Use your best judgment on design tools.",
          reason: "This is not expressible as a deterministic rule.",
        },
      ],
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections[0].clause).toBe(
        "Use your best judgment on design tools.",
      );
      expect(result.understood).toHaveLength(1);
    }
  });

  it("rejects an empty compilation that produced nothing at all", () => {
    const result = compile([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections[0].reason).toMatch(/nothing would be enforced/i);
    }
  });
});

describe("malformed compiler output", () => {
  it("rejects an unrecognized effect", () => {
    const result = compile([rule({ effect: "ALLOW_ALWAYS" })]);
    expect(result.ok).toBe(false);
  });

  it("rejects a condition on an unknown field", () => {
    const result = compile([
      rule({ conditions: [{ field: "MOON_PHASE", operator: "EQ", value: "full" }] }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections[0].reason).toMatch(/cannot evaluate/i);
    }
  });

  it("rejects a condition with an unknown operator", () => {
    const result = compile([
      rule({ conditions: [{ field: "AMOUNT", operator: "ROUGHLY", value: 100 }] }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-integer amount ceiling", () => {
    const result = compile([rule({ amountCeilingCents: 100.5 })]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rejections[0].reason).toMatch(/integer/i);
    }
  });

  it("rejects output that is not an object", () => {
    for (const bad of [null, "text", 42, []]) {
      const result = validateCompilation(bad, SOURCE);
      expect(result.ok).toBe(false);
    }
  });

  it("never throws on hostile output", () => {
    const hostile = [
      { rules: "not an array", unsupported: null },
      { rules: [null, 42, "x"], unsupported: [null] },
      { rules: [{ effect: {} }] },
      {},
    ];
    for (const input of hostile) {
      expect(() => validateCompilation(input, SOURCE)).not.toThrow();
      expect(validateCompilation(input, SOURCE).ok).toBe(false);
    }
  });
});
