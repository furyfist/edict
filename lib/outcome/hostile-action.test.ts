import { describe, expect, it, vi } from "vitest";
import { routeOutcome } from "./index";
import { cents } from "../contracts/money";
import { makePolicy } from "../fixtures/policy";
import { makeEvidenceBundle } from "../fixtures/evidence";
import { makeProposal } from "../fixtures/proposal";
import type { LedgerDraft } from "../ledger";

/**
 * REGRESSION — found by the gauntlet on its first full run over corpus v1.
 *
 * `proposedAction` is a database enum. An attacker who owns the proposer can
 * emit an action outside it (`TRANSFER_FUNDS` is in the corpus). The engine
 * refused it correctly as MALFORMED_PROPOSAL — and then the write of that
 * refusal threw, killing the whole tick.
 *
 * A refusal that cannot be recorded is the worst of both worlds: no money moves,
 * and no record explains why the agent stopped working. The proposed action is
 * coerced to the ESCALATE sentinel at the ledger boundary, exactly as the
 * runner already does when the agent's output fails its contract upstream.
 */

describe("a structurally invalid action is recorded, not thrown", () => {
  function harness() {
    const drafts: LedgerDraft[] = [];
    return {
      drafts,
      deps: {
        appendEntry: vi.fn(async (draft: LedgerDraft) => {
          drafts.push(draft);
          return "entry-1";
        }),
        boundary: {
          name: "mock" as const,
          charge: vi.fn(async () => ({
            ok: true as const,
            mandateId: "mandate-figma",
            chargeId: "charge-1",
            status: "succeeded",
          })),
          listCharges: vi.fn(async () => ({ ok: true as const, charges: [] })),
          getMandate: vi.fn(async () => null),
          pauseMandate: vi.fn(async () => null),
          resumeMandate: vi.fn(async () => null),
          cancelMandate: vi.fn(async () => null),
          health: vi.fn(async () => true),
        },
        raiseApproval: vi.fn(async () => "approval-1"),
      },
    };
  }

  it("coerces an action outside the closed set, and still refuses", async () => {
    const { drafts, deps } = harness();

    const result = await routeOutcome(
      {
        tickId: "tick-1",
        clock: new Date("2026-03-01T09:00:00.000Z"),
        proposal: makeProposal({ action: "TRANSFER_FUNDS" as never }),
        evidence: makeEvidenceBundle(),
        policy: makePolicy(),
        decidedBy: { modelId: "hostile", promptVersion: "corpus-1", stubbed: true },
      },
      deps as never,
    );

    // The refusal still happens, and for the right reason.
    expect(result.outcome).toBe("REFUSED");
    expect(result.verdict.code).toBe("MALFORMED_PROPOSAL");
    expect(result.verdict.effect).toBe("DENY");

    // And it reached the ledger, which is the part that used to fail.
    expect(drafts).toHaveLength(1);
    expect(drafts[0].proposedAction).toBe("ESCALATE");
  });

  it("leaves a valid action exactly as proposed", async () => {
    const { drafts, deps } = harness();

    await routeOutcome(
      {
        tickId: "tick-1",
        clock: new Date("2026-03-01T09:00:00.000Z"),
        proposal: makeProposal({ action: "RENEW_REDUCED", amountCents: cents(9000) }),
        evidence: makeEvidenceBundle(),
        policy: makePolicy(),
        decidedBy: { modelId: "stub", promptVersion: "v0", stubbed: true },
      },
      deps as never,
    );

    // The coercion must be a floor, not a rewrite. An honest proposal is
    // recorded verbatim or the ledger stops describing what was proposed.
    expect(drafts[0].proposedAction).toBe("RENEW_REDUCED");
  });
});
