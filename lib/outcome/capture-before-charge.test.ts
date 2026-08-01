import { describe, expect, it } from "vitest";
import { routeOutcome } from "./index";
import type { RouterDeps } from "./index";
import type { LedgerCompletion, LedgerDraft } from "../ledger";
import { cents } from "../contracts/money";
import { createMockAdapter, inMemoryMandateStore } from "../prava";
import type { MandateSnapshot, PaymentBoundary } from "../prava";
import {
  makeEvidenceBundle,
  missingUsageData,
  overCeiling,
} from "../fixtures/evidence";
import { compromisedProposal, makeProposal } from "../fixtures/proposal";
import { makePolicy } from "../fixtures/policy";

/**
 * Capture-before-charge, and the failure paths around it.
 *
 * The property under test: **every path that touches money ends in a recorded
 * outcome, and every failure ends in "nothing was charged."** An unrecorded
 * charge would destroy the ledger's premise, and a silent failure in a system
 * that moves money is worse than a loud one.
 *
 * Runs with no database — an in-memory mandate store and a fake ledger.
 */

interface Recorded {
  draft: LedgerDraft;
  completion: LedgerCompletion;
}

function harness(options: {
  mandates?: MandateSnapshot[];
  failMode?: "TRANSIENT" | "UNKNOWN" | null;
}) {
  const recorded: Recorded[] = [];
  let chargeCalls = 0;

  const store = inMemoryMandateStore(
    options.mandates ?? [
      {
        mandateId: "mandate-figma",
        status: "ACTIVE",
        capCents: cents(50000),
        remainingCents: cents(50000),
        expiresAt: null,
      },
    ],
  );

  const inner = createMockAdapter({ store, failMode: options.failMode ?? null });

  const boundary: PaymentBoundary = {
    ...inner,
    async charge(request) {
      chargeCalls += 1;
      return inner.charge(request);
    },
  };

  const approvals: Array<{ amountCents: number; code: string }> = [];

  const deps: RouterDeps = {
    boundary,
    async appendEntry(draft, completion) {
      recorded.push({ draft, completion });
      return `entry-${recorded.length}`;
    },
    async raiseApproval({ proposal, verdict }) {
      approvals.push({ amountCents: proposal.amountCents, code: verdict.code });
      return `approval-${approvals.length}`;
    },
  };

  return {
    deps,
    recorded,
    approvals,
    chargeCalls: () => chargeCalls,
  };
}

const base = {
  tickId: "tick-1",
  clock: new Date("2026-03-01T09:00:00.000Z"),
  decidedBy: { modelId: "stub", promptVersion: "v0", stubbed: true },
};

describe("a successful charge is recorded with its identifiers", () => {
  it("records EXECUTED and the charge id", async () => {
    const h = harness({});

    const result = await routeOutcome(
      {
        ...base,
        proposal: makeProposal({ amountCents: cents(9000) }),
        evidence: makeEvidenceBundle(),
        policy: makePolicy(),
      },
      h.deps,
    );

    expect(result.outcome).toBe("EXECUTED");
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0].completion.executedBy?.chargeId).toBeTruthy();
    expect(h.recorded[0].completion.chargedCents).toBe(9000);
  });
});

describe("a charge that fails still produces a record", () => {
  it("records the outcome when the provider is unreachable", async () => {
    const h = harness({ failMode: "UNKNOWN" });

    const result = await routeOutcome(
      {
        ...base,
        proposal: makeProposal({ amountCents: cents(9000) }),
        evidence: makeEvidenceBundle(),
        policy: makePolicy(),
      },
      h.deps,
    );

    expect(result.outcome).toBe("FAILED");
    expect(h.recorded).toHaveLength(1);
    expect(h.recorded[0].completion.chargedCents).toBe(0);
    expect(h.recorded[0].completion.error?.code).toBeTruthy();
  });

  it("carries the full evidence snapshot and attribution even on failure", async () => {
    // This is the capture-before-charge property: the draft was complete
    // before the adapter was ever called, so a failure loses nothing.
    const h = harness({ failMode: "UNKNOWN" });

    await routeOutcome(
      {
        ...base,
        proposal: makeProposal({ amountCents: cents(9000) }),
        evidence: makeEvidenceBundle(),
        policy: makePolicy(),
      },
      h.deps,
    );

    const { draft } = h.recorded[0];
    expect(draft.evidence.bundleId).toBeTruthy();
    expect(draft.authorizedBy?.ruleId).toBeTruthy();
    expect(draft.authorizedBy?.sourceFragment).toBeTruthy();
    expect(draft.decidedBy?.modelId).toBe("stub");
    expect(draft.counterfactualCents).toBe(18000);
  });
});

describe("retry discipline", () => {
  it("retries a transient failure exactly once", async () => {
    const h = harness({ failMode: "TRANSIENT" });

    const result = await routeOutcome(
      {
        ...base,
        proposal: makeProposal({ amountCents: cents(9000) }),
        evidence: makeEvidenceBundle(),
        policy: makePolicy(),
      },
      h.deps,
    );

    // First call fails transiently, second succeeds.
    expect(h.chargeCalls()).toBe(2);
    expect(result.outcome).toBe("EXECUTED");
  });

  it("never retries a decline", async () => {
    const h = harness({
      mandates: [
        {
          mandateId: "mandate-figma",
          status: "ACTIVE",
          capCents: cents(1000),
          remainingCents: cents(1000),
          expiresAt: null,
        },
      ],
    });

    const result = await routeOutcome(
      {
        ...base,
        proposal: makeProposal({ amountCents: cents(9000) }),
        evidence: makeEvidenceBundle(),
        policy: makePolicy(),
      },
      h.deps,
    );

    expect(h.chargeCalls()).toBe(1);
    expect(result.outcome).toBe("REFUSED");
    expect(h.recorded[0].completion.refusalCode).toBe("NETWORK_DECLINE");
    expect(h.recorded[0].completion.chargedCents).toBe(0);
  });
});

describe("nothing is charged unless the engine allows it", () => {
  it("does not call the adapter on a denial", async () => {
    const h = harness({});

    const result = await routeOutcome(
      {
        ...base,
        proposal: makeProposal({ amountCents: cents(0) }),
        evidence: makeEvidenceBundle(),
        policy: makePolicy(),
      },
      h.deps,
    );

    expect(result.outcome).toBe("REFUSED");
    expect(h.chargeCalls()).toBe(0);
  });

  it("does not call the adapter on an escalation", async () => {
    const h = harness({
      mandates: [
        {
          mandateId: "mandate-datadog",
          status: "ACTIVE",
          capCents: cents(250000),
          remainingCents: cents(250000),
          expiresAt: null,
        },
      ],
    });

    const result = await routeOutcome(
      {
        ...base,
        proposal: makeProposal({
          vendorId: "vendor-datadog",
          amountCents: cents(390000),
        }),
        evidence: overCeiling(),
        policy: makePolicy(),
      },
      h.deps,
    );

    expect(result.outcome).toBe("ESCALATED");
    expect(h.chargeCalls()).toBe(0);
    expect(h.recorded[0].completion.chargedCents).toBe(0);
  });

  it("raises a ceiling-raise approval when the amount exceeds authority", async () => {
    // Over the ceiling means only a passkey can help. Approving in-app must not
    // be able to satisfy this.
    const h = harness({
      mandates: [
        {
          mandateId: "mandate-datadog",
          status: "ACTIVE",
          capCents: cents(250000),
          remainingCents: cents(250000),
          expiresAt: null,
        },
      ],
    });

    await routeOutcome(
      {
        ...base,
        proposal: makeProposal({
          vendorId: "vendor-datadog",
          amountCents: cents(390000),
        }),
        evidence: overCeiling(),
        policy: makePolicy(),
      },
      h.deps,
    );

    expect(h.approvals).toHaveLength(1);
    expect(h.approvals[0].code).toBe("OVER_MANDATE_CEILING");
  });

  it("links the raised approval to the ledger entry", async () => {
    const h = harness({});

    const result = await routeOutcome(
      {
        ...base,
        proposal: makeProposal({ amountCents: cents(24000) }),
        evidence: missingUsageData(),
        policy: makePolicy(),
      },
      h.deps,
    );

    expect(result.outcome).toBe("ESCALATED");
    expect(result.approvalId).toBeTruthy();
    expect(h.recorded[0].draft.authorizedBy?.approvalId).toBe(result.approvalId);
  });
});

describe("the injection scenario, end to end through the router", () => {
  it("records a refusal and never reaches the adapter", async () => {
    const h = harness({
      mandates: [
        {
          mandateId: "mandate-cloudsync",
          status: "ACTIVE",
          capCents: cents(50000),
          remainingCents: cents(50000),
          expiresAt: null,
        },
      ],
    });

    const result = await routeOutcome(
      {
        ...base,
        proposal: compromisedProposal(),
        evidence: makeEvidenceBundle({
          vendorId: "vendor-cloudsync",
          vendorName: "CloudSync Pro",
        }),
        policy: makePolicy(),
      },
      h.deps,
    );

    expect(result.outcome).not.toBe("EXECUTED");
    expect(h.chargeCalls()).toBe(0);
    expect(h.recorded[0].completion.chargedCents).toBe(0);
    // The model's own words survive in the record, in their own field.
    expect(h.recorded[0].draft.agentRationale).toContain("Enterprise tier");
  });
});
