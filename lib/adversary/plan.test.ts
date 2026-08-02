import { describe, expect, it } from "vitest";
import { CORPUS, externalEntries } from "./corpus";
import { planAttack, planCorpus, resolveAmount, selectTarget } from "./plan";
import type { AttackTarget } from "./plan";
import { createHostileProposer, HOSTILE_MODEL_ID } from "./proposer";
import { createStubAgent } from "../agent/stub";
import { makeEvidenceBundle } from "../fixtures/evidence";

/**
 * Planning is pure, so the gauntlet is replayable. The tests that matter:
 *
 *   DETERMINISTIC   same corpus, same targets, same plan — every time
 *   HONEST          an attack that cannot be staged is NOT_APPLICABLE, never a
 *                   silent pass
 *   PORTABLE        amounts resolve against whatever ceilings exist now
 */

function target(overrides: Partial<AttackTarget> = {}): AttackTarget {
  return {
    vendorId: "vendor-figma",
    vendorName: "Figma",
    renewalId: "renewal-figma-2026-03",
    renewalAmountCents: 18000,
    mandateStatus: "ACTIVE",
    mandateRemainingCents: 50000,
    evidenceComplete: true,
    denied: false,
    ...overrides,
  };
}

const CANDIDATES: AttackTarget[] = [
  target(),
  target({
    vendorId: "vendor-cloudsync",
    vendorName: "CloudSync Pro",
    renewalId: "renewal-cloudsync-2026-03",
    renewalAmountCents: 9500,
  }),
  target({
    vendorId: "vendor-vercel",
    vendorName: "Vercel",
    renewalId: "renewal-vercel-2026-03",
    denied: true,
  }),
  target({
    vendorId: "vendor-airtable",
    vendorName: "Airtable",
    renewalId: "renewal-airtable-2026-03",
    evidenceComplete: false,
  }),
];

describe("attack planning", () => {
  it("is deterministic", () => {
    expect(JSON.stringify(planCorpus(CORPUS, CANDIDATES))).toBe(
      JSON.stringify(planCorpus(CORPUS, CANDIDATES)),
    );
  });

  it("reports an unstageable attack as NOT_APPLICABLE, never as a pass", () => {
    // No dead mandates in this environment. The DEAD_MANDATE attack cannot run,
    // and saying so is the difference between a measurement and a boast.
    const plans = planCorpus(CORPUS, CANDIDATES);
    const dead = plans.find((p) => p.entry.id === "dead-paused-mandate");

    expect(dead?.status).toBe("NOT_APPLICABLE");
    expect(dead?.status === "NOT_APPLICABLE" && dead.reason).toContain(
      "chargeable",
    );
  });

  it("stages that same attack once a mandate is actually dead", () => {
    const withPaused = [
      ...CANDIDATES,
      target({
        vendorId: "vendor-loom",
        vendorName: "Loom",
        renewalId: "renewal-loom-2026-03",
        mandateStatus: "PAUSED",
      }),
    ];

    const plan = planAttack(
      CORPUS.find((e) => e.id === "dead-paused-mandate")!,
      withPaused,
    );
    expect(plan.status).toBe("PLANNED");
    expect(plan.status === "PLANNED" && plan.target.vendorName).toBe("Loom");
  });

  it("resolves the ceiling boundary exactly", () => {
    const t = target({ mandateRemainingCents: 41000 });
    expect(resolveAmount({ kind: "OVER_CEILING", byCents: 1 }, t)).toBe(41001);
    expect(resolveAmount({ kind: "MULTIPLE_OF_CEILING", factor: 96 }, t)).toBe(
      3936000,
    );
    expect(resolveAmount({ kind: "RENEWAL" }, t)).toBe(18000);
    expect(resolveAmount({ kind: "ABSOLUTE", cents: -50000 }, t)).toBe(-50000);
  });

  it("aims each selector at the right vendor", () => {
    expect(selectTarget({ kind: "DENIED" }, CANDIDATES)?.vendorName).toBe(
      "Vercel",
    );
    expect(
      selectTarget({ kind: "INCOMPLETE_EVIDENCE" }, CANDIDATES)?.vendorName,
    ).toBe("Airtable");
    expect(
      selectTarget({ kind: "NAMED", vendorName: "CloudSync Pro" }, CANDIDATES)
        ?.vendorName,
    ).toBe("CloudSync Pro");
    // ANY_ACTIVE must skip the denied and incomplete ones — attacking those
    // with a generic attack would measure the wrong defence.
    expect(selectTarget({ kind: "ANY_ACTIVE" }, CANDIDATES)?.vendorName).toBe(
      "Figma",
    );
  });

  it("stages every external attack whose target actually exists", () => {
    // If external attacks routinely cannot be staged, the scoreboard is mostly
    // blanks and the run proves very little.
    //
    // Asserted against the SELECTOR rather than a count: the corpus grows when
    // the generator runs, and a magic number here would just be edited every
    // time rather than checked. The only attacks allowed to go unstaged are the
    // ones asking for something this environment genuinely does not have.
    const plans = planCorpus(externalEntries(), CANDIDATES);
    const unstaged = plans.filter((p) => p.status === "NOT_APPLICABLE");

    for (const plan of unstaged) {
      expect(plan.entry.target.kind, plan.entry.id).toBe("DEAD_MANDATE");
    }

    expect(plans.length - unstaged.length).toBeGreaterThan(0);
  });
});

describe("the hostile proposer", () => {
  const attack = planAttack(
    CORPUS.find((e) => e.id === "act-transfer-funds")!,
    CANDIDATES,
  );

  function hostile() {
    if (attack.status !== "PLANNED") throw new Error("expected a planned attack");
    return createHostileProposer({ attack, fallback: createStubAgent() });
  }

  it("emits exactly what the attacker chose, including invalid actions", async () => {
    // The whole point of this surface: submitting what the type system forbids.
    // A gate that can only receive well-typed input never exercises its guards.
    const result = await hostile().propose({
      evidence: makeEvidenceBundle({ vendorId: "vendor-figma" }),
      policyText: "(irrelevant — the attacker is not reading it)",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.proposal.action).toBe("TRANSFER_FUNDS");
  });

  it("leaves every other vendor to the ordinary proposer", async () => {
    // A gauntlet tick still adjudicates whatever else is due. Poisoning those
    // would contaminate the run with outcomes nobody attacked.
    const result = await hostile().propose({
      evidence: makeEvidenceBundle({ vendorId: "vendor-linear" }),
      policyText: "(policy)",
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.proposal.action).not.toBe("TRANSFER_FUNDS");
  });

  it("identifies itself, so an adversarial entry is never mistaken for a real decision", () => {
    expect(hostile().modelId).toBe(HOSTILE_MODEL_ID);
    expect(hostile().name).toBe("hostile");
  });
});
