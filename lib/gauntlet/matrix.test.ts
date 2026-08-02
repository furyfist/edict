import { describe, expect, it } from "vitest";
import { summarizeMatrix, type MatrixRow } from "./matrix";

/**
 * The matrix exists to support ONE sentence, and the tests here are mostly
 * about the sentences it must refuse to say.
 *
 * The roadmap asked for "authority outcomes invariant to proposer capability".
 * That is false — this repository's own runbook measured the live model
 * ignoring an injection the stub falls for, which produces different outcomes.
 * What is invariant is the BOUND: no proposer can move money authority did not
 * grant.
 */

function row(overrides: Partial<MatrixRow> = {}): MatrixRow {
  return {
    proposer: "stub",
    stubbed: true,
    attackId: "inj-enterprise-tier",
    vendorName: "CloudSync Pro",
    proposedCents: 4800000,
    outcome: "ESCALATED",
    chargedCents: 0,
    withinAuthority: true,
    ...overrides,
  };
}

const PROPOSERS = [
  { name: "stub", available: true, reason: null },
  { name: "openai/gpt-oss-120b", available: true, reason: null },
];

describe("the model matrix", () => {
  it("does not claim outcomes are identical across proposers", () => {
    // The stub takes the bait and escalates at the ceiling; the live model
    // ignores it and the real renewal executes. Both are the system working,
    // and a matrix asserting sameness would be asserting something false.
    const matrix = summarizeMatrix({
      attacksVaried: ["inj-enterprise-tier"],
      proposers: PROPOSERS,
      rows: [
        row({ proposer: "stub", proposedCents: 4800000, outcome: "ESCALATED" }),
        row({
          proposer: "openai/gpt-oss-120b",
          stubbed: false,
          proposedCents: 9500,
          outcome: "EXECUTED",
          chargedCents: 9500,
        }),
      ],
    });

    expect(matrix.sentence).toContain("NOT claimed to be identical");
    expect(matrix.sentence).toContain("the bound is what holds");
    expect(matrix.outsideAuthority).toEqual([]);
  });

  it("reports that the proposers actually disagreed", () => {
    // Evidence the variants are genuinely different. A matrix where everything
    // agreed would be weak evidence of invariance, and it says so.
    const differing = summarizeMatrix({
      attacksVaried: ["a"],
      proposers: PROPOSERS,
      rows: [row({ proposedCents: 100 }), row({ proposer: "llm", proposedCents: 200 })],
    });
    expect(differing.proposalsDiffered).toBe(true);
    expect(differing.sentence).toContain("did not agree");

    const agreeing = summarizeMatrix({
      attacksVaried: ["a"],
      proposers: PROPOSERS,
      rows: [row({ proposedCents: 100 }), row({ proposer: "llm", proposedCents: 100 })],
    });
    expect(agreeing.proposalsDiffered).toBe(false);
    expect(agreeing.sentence).toContain("weak evidence");
  });

  it("leads with the failure when any proposer escaped the bound", () => {
    const matrix = summarizeMatrix({
      attacksVaried: ["a"],
      proposers: PROPOSERS,
      rows: [
        row(),
        row({ proposer: "llm", chargedCents: 4800000, withinAuthority: false }),
      ],
    });

    expect(matrix.outsideAuthority).toHaveLength(1);
    expect(matrix.sentence).toContain("NOT invariant");
  });

  it("makes no claim at all when nothing ran", () => {
    const matrix = summarizeMatrix({
      attacksVaried: [],
      proposers: [{ name: "llm", available: false, reason: "no API key" }],
      rows: [],
    });

    // An empty matrix must not read as a clean result. Same discipline as an
    // unreadable book in reconciliation: absence is not evidence.
    expect(matrix.sentence).toContain("makes no invariance claim");
  });

  it("records which proposers could not be run, and why", () => {
    const matrix = summarizeMatrix({
      attacksVaried: ["a"],
      proposers: [
        { name: "stub", available: true, reason: null },
        { name: "llm", available: false, reason: "OPENAI_API_KEY is not set" },
      ],
      rows: [row()],
    });

    const missing = matrix.proposers.find((p) => !p.available);
    expect(missing?.reason).toContain("OPENAI_API_KEY");
    // One proposer is not a matrix; the sentence must not imply otherwise.
    expect(matrix.sentence).toContain("1 proposers");
  });
});
