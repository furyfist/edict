import { describe, expect, it } from "vitest";
import { evaluate } from "./evaluate";
import type { EngineEvidence, EngineProposal, PolicyRule } from "./types";

/**
 * The seeded policy, adjudicated against the seeded vendors.
 *
 * These are the three scenarios the M0 seed exists to produce — one allow, one
 * escalate, one deny. Verifying them against the engine directly proves that
 * the policy as written produces the outcomes the demo narrative claims, which
 * is a different question from whether the engine is internally consistent.
 */

const SEEDED_RULES: PolicyRule[] = [
  {
    id: "deny_cloudsync",
    ordinal: 1,
    effect: "DENY",
    conditions: [
      { field: "VENDOR_ID", operator: "EQ", value: "vendor_cloudsync" },
    ],
    amountCeiling: null,
    currency: "USD",
    sourceFragment: "Never renew anything from CloudSync Pro.",
    description: "Deny every renewal for CloudSync Pro.",
  },
  {
    id: "escalate_increase",
    ordinal: 2,
    effect: "REQUIRE_APPROVAL",
    conditions: [
      { field: "PRICE_INCREASE_BASIS_POINTS", operator: "GT", value: 1500 },
    ],
    amountCeiling: null,
    currency: "USD",
    sourceFragment:
      "Anything with a price increase above 15% needs my approval.",
    description: "Escalate renewals whose price rose by more than 15%.",
  },
  {
    id: "escalate_large",
    ordinal: 3,
    effect: "REQUIRE_APPROVAL",
    conditions: [{ field: "AMOUNT", operator: "GT", value: 500_00 }],
    amountCeiling: null,
    currency: "USD",
    sourceFragment: "Anything over $500 needs my approval.",
    description: "Escalate renewals above $500.00.",
  },
  {
    id: "allow_small",
    ordinal: 4,
    effect: "ALLOW_AUTO",
    conditions: [{ field: "AMOUNT", operator: "LTE", value: 100_00 }],
    amountCeiling: 100_00,
    currency: "USD",
    sourceFragment: "Renew anything under $100 automatically.",
    description: "Auto-renew charges at or below $100.00.",
  },
];

function adjudicate(evidence: EngineEvidence, proposal: EngineProposal | null) {
  return evaluate({
    evidence,
    proposal,
    rules: SEEDED_RULES,
    policyVersionId: "policy_seed_v1",
  });
}

describe("the seeded policy against the seeded vendors", () => {
  it("Figma at $45 with steady usage is renewed automatically", () => {
    const v = adjudicate(
      {
        bundleId: "b",
        vendor: { id: "vendor_figma", name: "Figma", category: "design" },
        renewal: { id: "r", amount: { cents: 45_00, currency: "USD" } },
        seats: { licensed: 20, active: 18, dormant: 2 },
        priceChange: { deltaBasisPoints: 0 },
        gaps: [],
      },
      {
        proposalId: "p",
        bundleId: "b",
        renewalId: "r",
        action: "RENEW",
        amount: { cents: 45_00, currency: "USD" },
      },
    );

    expect(v.decision).toBe("ALLOW_AUTO");
    expect(v.citedRuleId).toBe("allow_small");
    expect(v.permittedAmount).toEqual({ cents: 45_00, currency: "USD" });
  });

  it("Datadog at $1,240 with a 26% rise escalates, citing the rise", () => {
    const v = adjudicate(
      {
        bundleId: "b",
        vendor: {
          id: "vendor_datadog",
          name: "Datadog",
          category: "observability",
        },
        renewal: { id: "r", amount: { cents: 1_240_00, currency: "USD" } },
        seats: { licensed: 40, active: 31, dormant: 9 },
        priceChange: { deltaBasisPoints: 2653 },
        gaps: [],
      },
      {
        proposalId: "p",
        bundleId: "b",
        renewalId: "r",
        action: "ESCALATE",
        amount: { cents: 1_240_00, currency: "USD" },
      },
    );

    expect(v.decision).toBe("REQUIRE_APPROVAL");
    // The price rise is a lower ordinal than the amount rule, so it is the one
    // cited — the refusal quotes the sentence that actually decided it.
    expect(v.citedRuleId).toBe("escalate_increase");
    expect(v.citedSourceFragment).toBe(
      "Anything with a price increase above 15% needs my approval.",
    );
  });

  it("CloudSync Pro is denied outright, and the denial beats everything", () => {
    const v = adjudicate(
      {
        bundleId: "b",
        vendor: {
          id: "vendor_cloudsync",
          name: "CloudSync Pro",
          category: "storage",
        },
        renewal: { id: "r", amount: { cents: 3_600_00, currency: "USD" } },
        seats: null,
        priceChange: null,
        gaps: ["NO_USAGE_DATA", "NO_PRIOR_INVOICE"],
      },
      {
        proposalId: "p",
        bundleId: "b",
        renewalId: "r",
        action: "ESCALATE",
        amount: null,
      },
    );

    expect(v.decision).toBe("DENY");
    expect(v.citedRuleId).toBe("deny_cloudsync");
    expect(v.citedSourceFragment).toBe(
      "Never renew anything from CloudSync Pro.",
    );
  });

  it("CloudSync Pro is still denied even if the agent asks to renew it cheaply", () => {
    const v = adjudicate(
      {
        bundleId: "b",
        vendor: {
          id: "vendor_cloudsync",
          name: "CloudSync Pro",
          category: "storage",
        },
        // A manipulated agent proposing a small, innocuous-looking renewal.
        renewal: { id: "r", amount: { cents: 9_00, currency: "USD" } },
        seats: { licensed: 5, active: 5, dormant: 0 },
        priceChange: { deltaBasisPoints: 0 },
        gaps: [],
      },
      {
        proposalId: "p",
        bundleId: "b",
        renewalId: "r",
        action: "RENEW",
        amount: { cents: 9_00, currency: "USD" },
      },
    );

    // The amount would match the allow rule. The denial pass runs first, so it
    // never gets there. This is the property the whole two-pass design is for.
    expect(v.decision).toBe("DENY");
    expect(v.citedRuleId).toBe("deny_cloudsync");
  });
});
