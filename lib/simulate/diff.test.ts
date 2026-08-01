import { describe, expect, it } from "vitest";
import { buildBattery } from "./battery";
import { replay } from "./core";
import { diffReplays } from "./diff";
import { cents } from "../contracts/money";
import { terminalRule } from "../contracts/policy";
import { makePolicy } from "../fixtures/policy";
import { healthyVendor, makeEvidenceBundle } from "../fixtures/evidence";
import type { Policy, PolicyRule } from "../contracts";

/**
 * The diff has one job: name the authority that changed hands. The test that
 * matters most is the raised-ceiling case, because that is the edit that looks
 * trivial in text and hands over real money.
 */

const BUNDLES = [makeEvidenceBundle(), healthyVendor()];
const BATTERY = buildBattery(BUNDLES);

function policyWithCeiling(version: number, ceiling: number): Policy {
  const rules: PolicyRule[] = [
    {
      id: "rule-auto",
      ordinal: 0,
      effect: "ALLOW_AUTO",
      scope: { kind: "ANY" },
      conditions: { maxAmountCents: cents(ceiling) },
      sourceFragment: `Auto-renew anything under $${ceiling / 100} a month.`,
    },
  ];
  return makePolicy({
    id: `policy-v${version}`,
    version,
    rules: [...rules, terminalRule(rules.length)],
  });
}

function diffOf(fromCeiling: number, toCeiling: number) {
  return diffReplays(
    BATTERY,
    replay({ scenarios: BATTERY.scenarios, policy: policyWithCeiling(1, fromCeiling) }),
    replay({ scenarios: BATTERY.scenarios, policy: policyWithCeiling(2, toCeiling) }),
  );
}

describe("the behavioral diff", () => {
  it("reports nothing changed when nothing changed", () => {
    const result = diffOf(20000, 20000);
    expect(result.changes).toEqual([]);
    expect(result.summary.unchanged).toBe(BATTERY.scenarios.length);
  });

  it("names what a raised ceiling handed over", () => {
    // $200 -> $500 is three words of English and it is the entire point of the
    // diff: Figma at $180 was already automatic, Linear at $160 was too, but
    // anything between the two ceilings moves from "asks you" to "just does it".
    const result = diffOf(17000, 50000);

    expect(result.summary.gainedAutonomy).toBeGreaterThan(0);
    for (const change of result.changes) {
      expect(change.before.effect).not.toBe("ALLOW_AUTO");
      expect(change.after.effect).toBe("ALLOW_AUTO");
    }
  });

  it("names what a lowered ceiling took back", () => {
    const result = diffOf(50000, 17000);
    expect(result.summary.lostAutonomy).toBeGreaterThan(0);
    expect(result.summary.gainedAutonomy).toBe(0);
  });

  it("carries both sides of every change, with the rule that caused it", () => {
    for (const change of diffOf(17000, 50000).changes) {
      expect(change.before.matchedSourceFragment).toBeTruthy();
      expect(change.after.matchedSourceFragment).toBeTruthy();
      expect(change.vendorName).toBeTruthy();
      // The reader must be able to tell whether a change affects a real renewal
      // or only a hypothetical.
      expect(["history", "synthetic"]).toContain(change.origin);
    }
  });

  it("counts every scenario exactly once", () => {
    const { summary, scenarioCount } = diffOf(17000, 50000);
    const total =
      summary.gainedAutonomy +
      summary.lostAutonomy +
      summary.newlyRefused +
      summary.otherChanges +
      summary.unchanged;
    expect(total).toBe(scenarioCount);
  });

  it("ignores a change of rule that reaches the same effect", () => {
    // Re-attributing a verdict is not a change in authority. Counting it as one
    // would fill the diff with noise on every recompile, and the signal here is
    // the whole product.
    const before = replay({
      scenarios: BATTERY.scenarios,
      policy: policyWithCeiling(1, 50000),
    });
    const after = replay({
      scenarios: BATTERY.scenarios,
      policy: makePolicy({ version: 2 }),
    });

    for (const change of diffReplays(BATTERY, before, after).changes) {
      expect(change.before.effect).not.toBe(change.after.effect);
    }
  });

  it("refuses to diff two runs over different batteries", () => {
    const smaller = buildBattery([makeEvidenceBundle()]);
    expect(() =>
      diffReplays(
        BATTERY,
        replay({ scenarios: smaller.scenarios, policy: policyWithCeiling(1, 20000) }),
        replay({ scenarios: BATTERY.scenarios, policy: policyWithCeiling(2, 50000) }),
      ),
    ).toThrow(/same battery/);
  });
});
