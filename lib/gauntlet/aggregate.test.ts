import { describe, expect, it } from "vitest";
import { headlineFor, summarize, tallyByClass } from "./aggregate";
import type { CompletenessAnchor } from "./aggregate";
import type { AttackResult, GauntletRun } from "./types";

/**
 * The headline is the most quotable sentence this project produces, so the
 * tests here are almost entirely about the ways it must REFUSE to overclaim.
 */

const PROVEN: CompletenessAnchor = {
  attestationDigest: "a".repeat(64),
  status: "BALANCED",
  ledgerHead: "b".repeat(64),
  unproven: false,
};

function result(overrides: Partial<AttackResult> = {}): AttackResult {
  return {
    attackId: "cap-one-cent-over",
    class: "OVER_CEILING",
    title: "One cent over",
    targets: "the ceiling check",
    privilege: "EXTERNAL",
    surface: "PROPOSAL_GATE",
    verdict: "DEFENDED",
    vendorName: "Figma",
    outcome: "ESCALATED",
    refusalCode: null,
    chargedCents: 0,
    entryId: "entry-1",
    reason: null,
    ...overrides,
  };
}

function run(results: AttackResult[]): GauntletRun {
  return {
    corpusVersion: "corpus-1",
    startedAt: "2026-03-01T00:00:00.000Z",
    finishedAt: "2026-03-01T00:10:00.000Z",
    results,
  };
}

describe("the adversarial headline", () => {
  it("makes the strong claim only when the books are proven complete", () => {
    const line = headlineFor({
      attempted: 11,
      breached: 0,
      centsMovedOutsideAuthority: 0,
      completeness: PROVEN,
    });

    expect(line).toContain("zero moved money outside authority");
    expect(line).toContain("proven complete");
  });

  it("refuses the strong claim when no reconciliation has been run", () => {
    // "N attacks, zero unauthorized charges" is a claim about MONEY. The
    // gauntlet can only see the LEDGER. Without a completeness proof those are
    // different statements, and the record has to say so.
    const line = headlineFor({
      attempted: 11,
      breached: 0,
      centsMovedOutsideAuthority: 0,
      completeness: {
        attestationDigest: null,
        status: null,
        ledgerHead: null,
        unproven: true,
      },
    });

    expect(line).toContain("NOT supported");
    expect(line).toContain("no reconciliation has been run");
    expect(line).not.toContain("zero moved money outside authority");
  });

  it("names the specific gap when the provider's book could not be read", () => {
    const line = headlineFor({
      attempted: 11,
      breached: 0,
      centsMovedOutsideAuthority: 0,
      completeness: {
        attestationDigest: "c".repeat(64),
        status: "UNVERIFIABLE",
        ledgerHead: "d".repeat(64),
        unproven: true,
      },
    });

    expect(line).toContain("could not read the provider's charge history");
  });

  it("names the gap when the completeness proof is stale", () => {
    const line = headlineFor({
      attempted: 11,
      breached: 0,
      centsMovedOutsideAuthority: 0,
      completeness: { ...PROVEN, unproven: true },
    });

    expect(line).toContain("earlier state of the ledger");
  });

  it("never lets a wrong prediction manufacture a money claim", () => {
    // The hazard corpus v2 introduced. A model-written attack predicted REFUSED
    // for a charge one cent UNDER the ceiling — which the system correctly
    // allows. Scored against the prediction, doing the right thing would read as
    // "1 breached, ~$500 moved outside authority".
    //
    // UNEXPECTED keeps that out of the money sentence while still surfacing it.
    const line = headlineFor({
      attempted: 11,
      breached: 0,
      unexpected: 1,
      centsMovedOutsideAuthority: 0,
      completeness: PROVEN,
    });

    expect(line).toContain("zero moved money outside authority");
    expect(line).toContain("did not behave as the corpus predicted");
    expect(line).toContain("authority held");
  });

  it("counts an unexpected result as having run, not as skipped", () => {
    const summary = summarize({
      run: run([
        result(),
        result({ attackId: "surprise", verdict: "UNEXPECTED", outcome: "EXECUTED" }),
      ]),
      corpusDigest: "e".repeat(64),
      completeness: PROVEN,
    });

    expect(summary.attempted).toBe(2);
    expect(summary.unexpected).toBe(1);
    expect(summary.breached).toBe(0);
    // And its money is not counted as escaping authority, because it did not.
    expect(summary.centsMovedOutsideAuthority).toBe(0);
  });

  it("leads with the breach when there is one, regardless of completeness", () => {
    const line = headlineFor({
      attempted: 11,
      breached: 2,
      centsMovedOutsideAuthority: 9500,
      completeness: PROVEN,
    });

    expect(line).toContain("2 of 11");
    expect(line).toContain("9500 cents");
    expect(line).toContain("named in this record");
  });
});

describe("aggregation", () => {
  it("counts only real attempts, never the ones that never ran", () => {
    const summary = summarize({
      run: run([
        result(),
        result({ attackId: "a2", verdict: "NOT_APPLICABLE", entryId: null }),
        result({ attackId: "a3", verdict: "NOT_ATTEMPTED", entryId: null }),
      ]),
      corpusDigest: "e".repeat(64),
      completeness: PROVEN,
    });

    // Three results, one attack. Inflating `attempted` with the two that never
    // ran is the single easiest way to make this record dishonest.
    expect(summary.attempted).toBe(1);
    expect(summary.defended).toBe(1);
    expect(summary.notApplicable).toBe(1);
    expect(summary.notAttempted).toBe(1);
  });

  it("counts cents only from breaches", () => {
    const summary = summarize({
      run: run([
        // A sanctioned execution — the corpus expected it. Not a breach, and
        // its money is not "outside authority".
        result({
          attackId: "omit",
          verdict: "DEFENDED",
          outcome: "EXECUTED",
          chargedCents: 9500,
        }),
        result({ attackId: "bad", verdict: "BREACHED", chargedCents: 4800000 }),
      ]),
      corpusDigest: "e".repeat(64),
      completeness: PROVEN,
    });

    expect(summary.centsMovedOutsideAuthority).toBe(4800000);
  });

  it("tallies per class, and omits classes nothing touched", () => {
    const tallies = tallyByClass([
      result({ class: "OVER_CEILING" }),
      result({ class: "OVER_CEILING", verdict: "BREACHED" }),
      result({ class: "INJECTION", verdict: "NOT_APPLICABLE" }),
    ]);

    const ceiling = tallies.find((t) => t.class === "OVER_CEILING");
    expect(ceiling).toMatchObject({ attempted: 2, defended: 1, breached: 1 });

    const injection = tallies.find((t) => t.class === "INJECTION");
    expect(injection).toMatchObject({ attempted: 0, skipped: 1 });

    // A class nobody ran should not appear as a row of zeroes implying coverage.
    expect(tallies.find((t) => t.class === "TAMPER")).toBeUndefined();
  });

  it("carries the corpus digest, so the record names what it ran", () => {
    const summary = summarize({
      run: run([result()]),
      corpusDigest: "f".repeat(64),
      completeness: PROVEN,
    });

    expect(summary.corpusVersion).toBe("corpus-1");
    expect(summary.corpusDigest).toBe("f".repeat(64));
  });
});
