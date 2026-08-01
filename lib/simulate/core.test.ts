import { describe, expect, it } from "vitest";
import { countByEffect, replay, type Scenario } from "./core";
import { evaluate } from "../policy/engine";
import { cents } from "../contracts/money";
import { makePolicy } from "../fixtures/policy";
import {
  healthyVendor,
  makeEvidenceBundle,
  missingUsageData,
  noMandate,
  overCeiling,
  underAttack,
} from "../fixtures/evidence";
import { compromisedProposal, makeProposal } from "../fixtures/proposal";
import type { EvidenceBundle, Proposal } from "../contracts";

/**
 * The replayer's only real obligation: BE THE ENGINE.
 *
 * A preview that can disagree with the engine is worse than no preview, because
 * it would be a confident, signed statement about authority that authority does
 * not honour. So the assertion here is not "the replayer produces sensible
 * verdicts" — it is "the replayer produces exactly the verdicts `evaluate`
 * produces, for every case the engine's own suite covers."
 */

function scenarioOf(
  id: string,
  evidence: EvidenceBundle,
  proposal: Proposal,
): Scenario {
  return { id, label: id, origin: "synthetic", note: null, evidence, proposal };
}

/**
 * One scenario per situation the engine's own tests exercise: every verdict
 * code, every completeness gap, every structural guard.
 */
const CASES: Scenario[] = [
  scenarioOf("healthy", healthyVendor(), makeProposal({ vendorId: "vendor-linear" })),
  scenarioOf("figma-reduced", makeEvidenceBundle(), makeProposal()),
  scenarioOf("no-usage", missingUsageData(), makeProposal({ vendorId: "vendor-airtable" })),
  // Vercel is the DENIED vendor in the fixture policy, so its no-mandate case
  // dies in pass 1 and never reaches the authority check. Both facts are worth a
  // scenario: the prohibition, and the missing mandate on a vendor nobody
  // prohibited.
  scenarioOf("denied-vendor", noMandate(), makeProposal({ vendorId: "vendor-vercel" })),
  scenarioOf(
    "no-mandate",
    makeEvidenceBundle({
      mandate: {
        mandateId: null,
        status: null,
        capCents: null,
        remainingCents: null,
        expiresAt: null,
      },
      completeness: { hasUsageData: true, hasPriceHistory: true, hasMandate: false },
    }),
    makeProposal(),
  ),
  scenarioOf("over-ceiling", overCeiling(), makeProposal({
    vendorId: "vendor-datadog",
    amountCents: cents(390000),
  })),
  scenarioOf("injected", underAttack(), compromisedProposal()),
  scenarioOf("no-price-history", makeEvidenceBundle({
    priceHistory: [],
    completeness: { hasUsageData: true, hasPriceHistory: false, hasMandate: true },
  }), makeProposal()),
  scenarioOf("paused-mandate", makeEvidenceBundle({
    mandate: {
      mandateId: "mandate-figma",
      status: "PAUSED",
      capCents: cents(50000),
      remainingCents: cents(50000),
      expiresAt: null,
    },
  }), makeProposal()),
  scenarioOf("bad-action", makeEvidenceBundle(), makeProposal({
    action: "TRANSFER_FUNDS" as never,
  })),
  scenarioOf("zero-amount", makeEvidenceBundle(), makeProposal({
    amountCents: cents(0),
  })),
  scenarioOf("negative-amount", makeEvidenceBundle(), makeProposal({
    amountCents: -100 as never,
  })),
  scenarioOf("foreign-currency", makeEvidenceBundle(), makeProposal({
    currency: "EUR" as never,
  })),
];

describe("the replayer is the engine, applied pointwise", () => {
  it("reproduces evaluate() exactly, for every case", () => {
    const policy = makePolicy();
    const result = replay({ scenarios: CASES, policy });

    for (const [index, scenario] of CASES.entries()) {
      expect(result.verdicts[index].scenarioId).toBe(scenario.id);
      expect(result.verdicts[index].verdict).toEqual(
        evaluate({
          proposal: scenario.proposal,
          evidence: scenario.evidence,
          policy,
        }),
      );
    }
  });

  it("covers every verdict class, so the assertion above is not vacuous", () => {
    const result = replay({ scenarios: CASES, policy: makePolicy() });
    const codes = new Set(result.verdicts.map((item) => item.verdict.code));

    // If a future refactor collapses these, the test above would still pass
    // while checking almost nothing.
    expect(codes).toContain("RULE_MATCHED");
    expect(codes).toContain("EVIDENCE_INCOMPLETE");
    expect(codes).toContain("MALFORMED_PROPOSAL");
    expect(codes).toContain("OVER_MANDATE_CEILING");
    expect(codes).toContain("NO_MANDATE");
    expect(codes).toContain("MANDATE_NOT_CHARGEABLE");
    expect(codes).toContain("UNSUPPORTED_CURRENCY");

    const effects = countByEffect(result);
    expect(effects.ALLOW_AUTO).toBeGreaterThan(0);
    expect(effects.REQUIRE_APPROVAL).toBeGreaterThan(0);
    expect(effects.DENY).toBeGreaterThan(0);
  });

  it("preserves scenario order rather than grouping by verdict", () => {
    // Order is data. The preview renders grouped, but grouping is a view
    // decision made above this layer — the replay itself must stay aligned with
    // the battery it was given.
    const result = replay({ scenarios: CASES, policy: makePolicy() });
    expect(result.verdicts.map((item) => item.scenarioId)).toEqual(
      CASES.map((scenario) => scenario.id),
    );
  });

  it("is deterministic — two replays are indistinguishable", () => {
    const policy = makePolicy();
    expect(JSON.stringify(replay({ scenarios: CASES, policy }))).toBe(
      JSON.stringify(replay({ scenarios: CASES, policy })),
    );
  });

  it("carries the policy identity, so a verdict set can never be misattributed", () => {
    const result = replay({ scenarios: CASES, policy: makePolicy({ version: 7 }) });
    expect(result.policyVersion).toBe(7);
    expect(result.policyId).toBe("policy-v1");
  });

  it("an empty battery is an empty replay, not an error", () => {
    const result = replay({ scenarios: [], policy: makePolicy() });
    expect(result.verdicts).toEqual([]);
    expect(countByEffect(result)).toEqual({
      ALLOW_AUTO: 0,
      REQUIRE_APPROVAL: 0,
      DENY: 0,
    });
  });
});
