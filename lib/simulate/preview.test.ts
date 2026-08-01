import { describe, expect, it } from "vitest";
import { buildBattery } from "./battery";
import { replay } from "./core";
import { groupByEffect, summarize } from "./preview";
import { digestOf } from "../attest/canonical";
import { makePolicy } from "../fixtures/policy";
import { healthyVendor, makeEvidenceBundle, noMandate } from "../fixtures/evidence";

/**
 * The preview is the projection that gets signed. Two properties matter more
 * than anything else here:
 *
 *   STABLE — the same policy over the same books hashes to the same value, or
 *            the activation record proves nothing.
 *   HONEST — a mismatch between battery and replay throws rather than renders.
 */

const BUNDLES = [makeEvidenceBundle(), healthyVendor(), noMandate()];

function previewOf(policyVersion = 1) {
  const policy = makePolicy({ version: policyVersion });
  const battery = buildBattery(BUNDLES);
  return summarize(battery, replay({ scenarios: battery.scenarios, policy }));
}

describe("the preview", () => {
  it("hashes identically across builds", () => {
    expect(digestOf(previewOf())).toBe(digestOf(previewOf()));
  });

  it("changes its hash when the policy version changes", () => {
    // The version is inside the signed projection on purpose: a preview that
    // did not identify its policy could be pinned to the wrong activation.
    expect(digestOf(previewOf(1))).not.toBe(digestOf(previewOf(2)));
  });

  it("has one row per scenario, in battery order", () => {
    const battery = buildBattery(BUNDLES);
    const preview = summarize(
      battery,
      replay({ scenarios: battery.scenarios, policy: makePolicy() }),
    );

    expect(preview.scenarioCount).toBe(battery.scenarios.length);
    expect(preview.rows.map((row) => row.scenarioId)).toEqual(
      battery.scenarios.map((scenario) => scenario.id),
    );
  });

  it("cites a rule and its source fragment on every row", () => {
    // The claim the modal makes is that nothing enforces anything it cannot
    // quote. Every row, including the refusals.
    for (const row of previewOf().rows) {
      expect(row.matchedRuleId).toBeTruthy();
      expect(row.matchedSourceFragment).toBeTruthy();
    }
  });

  it("counts every effect, including the ones that are zero", () => {
    const counts = previewOf().counts;
    expect(Object.keys(counts).sort()).toEqual([
      "ALLOW_AUTO",
      "DENY",
      "REQUIRE_APPROVAL",
    ]);
  });

  it("groups into the three questions the modal asks", () => {
    const groups = groupByEffect(previewOf());

    expect(groups.map((group) => group.heading)).toEqual([
      "would auto-execute",
      "would come to you",
      "would refuse",
    ]);
    // Grouping is a view: no row is lost and none is duplicated.
    expect(groups.reduce((total, group) => total + group.rows.length, 0)).toBe(
      previewOf().scenarioCount,
    );
  });

  it("throws rather than render a preview whose rows do not match its scenarios", () => {
    const battery = buildBattery(BUNDLES);
    const result = replay({ scenarios: battery.scenarios, policy: makePolicy() });

    expect(() =>
      summarize(battery, { ...result, verdicts: result.verdicts.slice(1) }),
    ).toThrow(/same run/);

    expect(() =>
      summarize(battery, {
        ...result,
        verdicts: [...result.verdicts].reverse(),
      }),
    ).toThrow(/at that position/);
  });

  it("carries the battery version, so a preview names what it rehearsed against", () => {
    expect(previewOf().batteryVersion).toBe(buildBattery(BUNDLES).version);
  });
});
