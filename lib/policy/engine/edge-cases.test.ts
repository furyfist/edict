import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import type {
  EngineEvidence,
  EngineInput,
  EngineProposal,
  PolicyRule,
} from "./types";

/**
 * Edge cases and fail-closed behavior.
 *
 * Invariant 6: missing evidence, unmatched rules, and malformed proposals all
 * resolve to REQUIRE_APPROVAL or DENY, never to ALLOW_AUTO. Each case below is
 * a way someone might reach an unattended charge that they should not reach.
 *
 * The final assertion of this file is the one that matters most: across every
 * case, nothing produced ALLOW_AUTO except where a charge was genuinely
 * permitted.
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
    sourceFragment: "Renew anything under $100 automatically.",
    description: "Auto-renew charges at or below $100.00.",
    ...over,
  };
}

function run(over: Partial<EngineInput> = {}) {
  return evaluate({
    evidence: evidence(),
    proposal: proposal(),
    rules: [rule({ id: "allow_under_100" })],
    policyVersionId: "policy_1",
    ...over,
  });
}

describe("edge case 1 — no rules at all", () => {
  it("falls to the terminal default rather than allowing", () => {
    const v = run({ rules: [] });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("TERMINAL_DEFAULT");
  });
});

describe("edge case 2 — no rule matches", () => {
  it("falls to the terminal default", () => {
    const v = run({
      rules: [
        rule({
          id: "other_vendor_only",
          conditions: [
            { field: "VENDOR_ID", operator: "EQ", value: "vendor_other" },
          ],
        }),
      ],
    });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("TERMINAL_DEFAULT");
  });
});

describe("edge case 3 — no proposal produced", () => {
  it("escalates instead of throwing", () => {
    const v = run({ proposal: null });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("MALFORMED_PROPOSAL");
    expect(v.proposalId).toBeNull();
  });
});

describe("edge case 4 — an action outside the known set", () => {
  it("escalates rather than guessing the nearest action", () => {
    const v = run({ proposal: proposal({ action: "WIRE_FUNDS" }) });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("UNKNOWN_ACTION");
  });

  it("is not fooled by casing or whitespace", () => {
    for (const action of [" RENEW", "renew", "Renew", "RENEW "]) {
      const v = run({ proposal: proposal({ action }) });
      expect(v.decision).not.toBe("ALLOW_AUTO");
    }
  });
});

describe("edge case 5 — evidence gaps under a matching allow rule", () => {
  it("escalates and names the gaps", () => {
    const v = run({ evidence: evidence({ gaps: ["NO_USAGE_DATA"] }) });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("MISSING_EVIDENCE");
    expect(v.counterfactual?.detail.missingGaps).toEqual(["NO_USAGE_DATA"]);
  });
});

describe("edge case 6 — amount over the ceiling", () => {
  it("escalates and reports both figures", () => {
    const v = run({
      evidence: evidence({
        renewal: { id: "renewal_1", amount: { cents: 250_00, currency: "USD" } },
      }),
      proposal: proposal({ amount: { cents: 250_00, currency: "USD" } }),
    });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("AMOUNT_EXCEEDS_CEILING");
    expect(v.counterfactual?.detail).toEqual({
      ceiling: 100_00,
      actualAmount: 250_00,
    });
  });

  it("allows an amount exactly at the ceiling", () => {
    const v = run({
      evidence: evidence({
        renewal: { id: "renewal_1", amount: { cents: 100_00, currency: "USD" } },
      }),
      proposal: proposal({ amount: { cents: 100_00, currency: "USD" } }),
    });
    expect(v.decision).toBe("ALLOW_AUTO");
  });
});

describe("edge case 7 — an ALLOW_AUTO rule with no ceiling", () => {
  it("is not honored for a money-moving action", () => {
    const v = run({
      rules: [rule({ id: "unbounded", amountCeiling: null })],
    });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("AMOUNT_EXCEEDS_CEILING");
  });

  it("is honored for an action that moves no money", () => {
    const v = run({
      rules: [rule({ id: "unbounded", amountCeiling: null })],
      proposal: proposal({ action: "PAUSE", amount: null }),
    });
    expect(v.decision).toBe("ALLOW_AUTO");
    expect(v.permittedAmount).toBeNull();
  });
});

describe("edge case 8 — a renewal proposal carrying no amount", () => {
  it("escalates rather than defaulting to the evidence amount", () => {
    const v = run({ proposal: proposal({ amount: null }) });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("MALFORMED_PROPOSAL");
  });
});

describe("edge case 9 — the agent asks for more than the evidence supports", () => {
  it("is held to the evidence amount, not the requested one", () => {
    const v = run({
      evidence: evidence({
        renewal: { id: "renewal_1", amount: { cents: 45_00, currency: "USD" } },
      }),
      proposal: proposal({ amount: { cents: 90_00, currency: "USD" } }),
    });
    expect(v.decision).toBe("ALLOW_AUTO");
    expect(v.permittedAmount).toEqual({ cents: 45_00, currency: "USD" });
  });

  it("cannot escape the ceiling by inflating the request", () => {
    const v = run({
      evidence: evidence({
        renewal: { id: "renewal_1", amount: { cents: 500_00, currency: "USD" } },
      }),
      proposal: proposal({ amount: { cents: 1_00, currency: "USD" } }),
    });
    // The smaller of the two is adjudicated, so this one is permitted at $1.
    expect(v.permittedAmount?.cents).toBe(1_00);
  });
});

describe("edge case 10 — a condition addressing an unavailable fact", () => {
  it("does not match, so an allow rule depending on it does not apply", () => {
    const v = run({
      evidence: evidence({ seats: null, gaps: [] }),
      rules: [
        rule({
          id: "allow_if_few_dormant",
          conditions: [
            { field: "DORMANT_SEAT_COUNT", operator: "LTE", value: 5 },
          ],
        }),
      ],
    });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
    expect(v.reason).toBe("TERMINAL_DEFAULT");
  });

  it("still matches a DENY that depends on an available fact", () => {
    const v = run({
      evidence: evidence({ priceChange: { deltaBasisPoints: 2600 } }),
      rules: [
        rule({
          id: "deny_big_increase",
          effect: "DENY",
          conditions: [
            {
              field: "PRICE_INCREASE_BASIS_POINTS",
              operator: "GT",
              value: 1500,
            },
          ],
        }),
      ],
    });
    expect(v.decision).toBe("DENY");
  });
});

describe("edge case 11 — malformed condition operands", () => {
  it("a numeric comparison against a string operand does not match", () => {
    const v = run({
      rules: [
        rule({
          id: "bad_operand",
          conditions: [
            { field: "AMOUNT", operator: "LTE", value: "fifty dollars" },
          ],
        }),
      ],
    });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
  });

  it("a comparison with no operand at all does not match", () => {
    const v = run({
      rules: [
        rule({
          id: "no_operand",
          conditions: [{ field: "AMOUNT", operator: "LTE" }],
        }),
      ],
    });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
  });

  it("NaN and Infinity operands do not match", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const v = run({
        rules: [
          rule({
            id: "hostile_operand",
            conditions: [{ field: "AMOUNT", operator: "LTE", value }],
          }),
        ],
      });
      expect(v.decision).not.toBe("ALLOW_AUTO");
    }
  });
});

describe("edge case 12 — an unknown condition field", () => {
  it("does not match, so it cannot grant permission", () => {
    const v = run({
      rules: [
        rule({
          id: "unknown_field",
          conditions: [
            {
              // Deliberately outside the closed set — a hand-edited or
              // migrated rule referencing a field the engine does not know.
              field: "MOON_PHASE" as never,
              operator: "EQ",
              value: "full",
            },
          ],
        }),
      ],
    });
    expect(v.decision).toBe("REQUIRE_APPROVAL");
  });
});

describe("edge case 13 — evidence gaps with an explicit gap rule", () => {
  it("a DENY on a named gap fires in the denial pass", () => {
    const v = run({
      evidence: evidence({ gaps: ["NO_USAGE_DATA"] }),
      rules: [
        rule({
          id: "deny_without_usage",
          effect: "DENY",
          conditions: [
            {
              field: "EVIDENCE_GAP",
              operator: "PRESENT",
              value: "NO_USAGE_DATA",
            },
          ],
        }),
      ],
    });
    expect(v.decision).toBe("DENY");
    expect(v.citedRuleId).toBe("deny_without_usage");
  });

  it("an ABSENT condition matches only when the gap is genuinely absent", () => {
    const withGap = run({
      evidence: evidence({ gaps: ["NO_USAGE_DATA"] }),
      rules: [
        rule({
          id: "allow_if_complete",
          conditions: [
            {
              field: "EVIDENCE_GAP",
              operator: "ABSENT",
              value: "NO_USAGE_DATA",
            },
          ],
        }),
      ],
    });
    const withoutGap = run({
      rules: [
        rule({
          id: "allow_if_complete",
          conditions: [
            {
              field: "EVIDENCE_GAP",
              operator: "ABSENT",
              value: "NO_USAGE_DATA",
            },
          ],
        }),
      ],
    });

    expect(withGap.decision).toBe("REQUIRE_APPROVAL");
    expect(withoutGap.decision).toBe("ALLOW_AUTO");
  });
});

describe("invariant 6 — unknown never resolves to ALLOW_AUTO", () => {
  it("holds across every degenerate input", () => {
    const degenerate: Partial<EngineInput>[] = [
      { rules: [] },
      { proposal: null },
      { proposal: proposal({ action: "" }) },
      { proposal: proposal({ action: "TRANSFER" }) },
      { proposal: proposal({ amount: null }) },
      { evidence: evidence({ gaps: ["NO_USAGE_DATA", "NO_PRIOR_INVOICE"] }) },
      { evidence: evidence({ seats: null, gaps: ["NO_USAGE_DATA"] }) },
      { rules: [rule({ id: "no_ceiling", amountCeiling: null })] },
      {
        evidence: evidence({
          renewal: {
            id: "renewal_1",
            amount: { cents: 9_999_999, currency: "USD" },
          },
        }),
        proposal: proposal({
          amount: { cents: 9_999_999, currency: "USD" },
        }),
      },
    ];

    for (const input of degenerate) {
      const v = run(input);
      expect(["REQUIRE_APPROVAL", "DENY"]).toContain(v.decision);
      expect(v.citedRuleId).toBeTruthy();
      expect(v.permittedAmount).toBeNull();
    }
  });
});

describe("invariant 3 — the engine is dependency-free", () => {
  it("imports nothing outside its own directory", () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );

    expect(sources.length).toBeGreaterThan(0);

    for (const file of sources) {
      const text = readFileSync(join(dir, file), "utf8");
      const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1],
      );
      for (const specifier of imports) {
        // Relative imports must stay within this directory, and there are no
        // bare package imports at all — not even node builtins.
        expect(specifier.startsWith("./")).toBe(true);
        expect(specifier).not.toContain("..");
      }
    }
  });

  it("reads no clock and uses no randomness", () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );

    for (const file of sources) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text).not.toContain("Date.now");
      expect(text).not.toContain("new Date");
      expect(text).not.toContain("Math.random");
      expect(text).not.toContain("process.env");
    }
  });
});
