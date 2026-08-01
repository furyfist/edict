import { describe, expect, it } from "vitest";
import { BATTERY_VERSION, EDGE_KINDS, buildBattery } from "./battery";
import { countByEffect, replay } from "./core";
import { makePolicy } from "../fixtures/policy";
import {
  healthyVendor,
  makeEvidenceBundle,
  noMandate,
  overCeiling,
} from "../fixtures/evidence";

/**
 * The battery's obligations, in order of how badly a failure would hurt:
 *
 *  1. STABLE. A preview hash is signed into an activation record. If the same
 *     inputs produced a different battery on Tuesday, that signature would be a
 *     statement about nothing.
 *  2. HONEST. Exactly one scenario per vendor is real, and every other row says
 *     so in its own data.
 *  3. COMPLETE. Every verdict class appears, or the preview is a happy-path
 *     demo wearing a boundary-case costume.
 */

const BUNDLES = [makeEvidenceBundle(), healthyVendor(), overCeiling(), noMandate()];

describe("the scenario battery", () => {
  it("is byte-identical across builds", () => {
    expect(JSON.stringify(buildBattery(BUNDLES))).toBe(
      JSON.stringify(buildBattery(BUNDLES)),
    );
  });

  it("is the complete cross product — no vendor is selected for special treatment", () => {
    const battery = buildBattery(BUNDLES);

    for (const bundle of BUNDLES) {
      const forVendor = battery.scenarios.filter(
        (scenario) => scenario.evidence.vendorId === bundle.vendorId,
      );
      // One history row plus every edge that can be built for this vendor.
      // Vercel has no mandate, so the ceiling and pause edges cannot be asked
      // of it — and that is the ONLY reason a count may differ.
      const buildable = bundle.mandate.mandateId === null ? EDGE_KINDS.length - 3 : EDGE_KINDS.length;
      expect(forVendor).toHaveLength(buildable + 1);
    }
  });

  it("marks exactly one scenario per vendor as real", () => {
    const battery = buildBattery(BUNDLES);
    const history = battery.scenarios.filter((s) => s.origin === "history");

    expect(history).toHaveLength(BUNDLES.length);
    for (const scenario of history) {
      // The real row carries the real amount. If this drifts, the preview stops
      // describing the renewal actually on the books.
      expect(scenario.proposal.amountCents).toBe(scenario.evidence.renewal.amountCents);
      expect(scenario.note).toBeNull();
    }
  });

  it("every synthetic scenario says it is synthetic, in its own rationale", () => {
    const battery = buildBattery(BUNDLES);
    const synthetic = battery.scenarios.filter((s) => s.origin === "synthetic");

    expect(synthetic.length).toBeGreaterThan(0);
    for (const scenario of synthetic) {
      expect(scenario.proposal.rationale).toContain("Not proposed by any model");
      expect(scenario.note).not.toBeNull();
    }
  });

  it("gives every scenario a distinct id and a distinct bundle id", () => {
    const battery = buildBattery(BUNDLES);
    const ids = battery.scenarios.map((s) => s.id);
    const bundleIds = battery.scenarios.map((s) => s.evidence.bundleId);

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(bundleIds).size).toBe(bundleIds.length);
  });

  it("straddles the ceiling exactly — one cent decides it", () => {
    const battery = buildBattery([makeEvidenceBundle()]);
    const result = replay({ scenarios: battery.scenarios, policy: makePolicy() });

    const verdictFor = (kind: string) =>
      result.verdicts.find((v) => v.scenarioId.endsWith(`::${kind}`))!.verdict;

    // At the ceiling the engine hands off to the rules; one cent over, it stops
    // and asks for a human. This pair is the whole argument for the preview.
    expect(verdictFor("at-ceiling").code).not.toBe("OVER_MANDATE_CEILING");
    expect(verdictFor("over-ceiling").code).toBe("OVER_MANDATE_CEILING");
    expect(verdictFor("over-ceiling").effect).toBe("REQUIRE_APPROVAL");
  });

  it("produces every verdict class under the seeded policy", () => {
    const battery = buildBattery(BUNDLES);
    const result = replay({ scenarios: battery.scenarios, policy: makePolicy() });
    const codes = new Set(result.verdicts.map((item) => item.verdict.code));

    expect(codes).toContain("RULE_MATCHED");
    expect(codes).toContain("EVIDENCE_INCOMPLETE");
    expect(codes).toContain("OVER_MANDATE_CEILING");
    expect(codes).toContain("MANDATE_NOT_CHARGEABLE");
    expect(codes).toContain("NO_MANDATE");
    expect(codes).toContain("MALFORMED_PROPOSAL");

    // The preview must visibly include refusals and escalations, not just
    // approvals. A battery that only ever produced ALLOW_AUTO would be the
    // rigged thing this design exists to avoid.
    const effects = countByEffect(result);
    expect(effects.ALLOW_AUTO).toBeGreaterThan(0);
    expect(effects.REQUIRE_APPROVAL).toBeGreaterThan(0);
    expect(effects.DENY).toBeGreaterThan(0);
  });

  it("is versioned, so two previews can be known to be comparable", () => {
    expect(buildBattery(BUNDLES).version).toBe(BATTERY_VERSION);
  });

  it("no renewals is an empty battery, not a crash", () => {
    expect(buildBattery([]).scenarios).toEqual([]);
  });
});
