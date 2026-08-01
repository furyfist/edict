import type { EvidenceBundle, ProposalResult } from "../contracts";

/**
 * The stub proposer.
 *
 * A deterministic function from evidence to proposal. It is the key de-risking
 * move of M1: with it in place the whole pipeline is end-to-end testable before
 * a language model exists, so the first run has zero possible sources of
 * non-determinism rather than two.
 *
 * It is retained in the repository through the demo as a live fallback. When
 * the model is unreachable, slow, or behaving strangely on stage, this is what
 * runs, and the demo continues.
 *
 * Its judgments are intentionally simple. It is not pretending to be clever —
 * the product's claim has never been that the agent is clever.
 */

/** Escalate anything at or above this. Above it, judgment is not the stub's. */
const LARGE_AMOUNT_CENTS = 500_00;

/** A price rise beyond this is worth a human's attention. 15%. */
const NOTABLE_INCREASE_BASIS_POINTS = 1500;

/** Dormancy beyond this suggests the seat count is wrong. 25%. */
const NOTABLE_DORMANCY_BASIS_POINTS = 2500;

export function stubPropose(bundle: EvidenceBundle): ProposalResult {
  const proposalId = `proposal_${bundle.renewal.id}_${bundle.observedAt}`;
  const base = {
    proposalId,
    bundleId: bundle.bundleId,
    renewalId: bundle.renewal.id,
    proposedAt: bundle.observedAt,
    producedBy: "stub",
  };

  // Missing facts are escalated rather than guessed around. The engine would
  // escalate this anyway; the stub agreeing with it keeps the demo's narrative
  // honest — the refusal is not the agent being overridden, it is the agent and
  // the engine independently reaching the same conclusion.
  if (bundle.gaps.length > 0) {
    return {
      ok: true,
      proposal: {
        ...base,
        action: "ESCALATE",
        amount: null,
        seatCount: null,
        rationale: `Evidence is incomplete for ${bundle.vendor.name}: ${bundle.gaps.join(", ")}.`,
        rejectedAlternative:
          "Renewing on the prior cycle's terms was rejected because there is no verified basis for the current amount.",
      },
    };
  }

  const amountCents = bundle.renewal.amount.cents;
  const increase = bundle.priceChange?.deltaBasisPoints ?? 0;

  if (increase > NOTABLE_INCREASE_BASIS_POINTS) {
    const pct = (increase / 100).toFixed(1);
    return {
      ok: true,
      proposal: {
        ...base,
        action: "ESCALATE",
        amount: bundle.renewal.amount,
        seatCount: null,
        rationale: `${bundle.vendor.name} has increased by ${pct}% over the previous cycle.`,
        rejectedAlternative:
          "Renewing at the new price was rejected because a rise of this size has not been agreed.",
      },
    };
  }

  if (amountCents >= LARGE_AMOUNT_CENTS) {
    return {
      ok: true,
      proposal: {
        ...base,
        action: "ESCALATE",
        amount: bundle.renewal.amount,
        seatCount: null,
        rationale: `${bundle.vendor.name} renews at a material amount for this budget.`,
        rejectedAlternative:
          "Renewing unattended was rejected because the amount warrants a human decision.",
      },
    };
  }

  const seats = bundle.seats;
  if (seats && seats.licensed > 0) {
    const dormancy = Math.round((seats.dormant * 10_000) / seats.licensed);
    if (dormancy > NOTABLE_DORMANCY_BASIS_POINTS) {
      const perSeat = Math.floor(amountCents / seats.licensed);
      return {
        ok: true,
        proposal: {
          ...base,
          action: "RENEW_REDUCED_SEATS",
          amount: {
            cents: perSeat * seats.active,
            currency: bundle.renewal.amount.currency,
          },
          seatCount: seats.active,
          rationale: `${seats.dormant} of ${seats.licensed} ${bundle.vendor.name} seats have been dormant for ${seats.windowDays} days.`,
          rejectedAlternative:
            "Renewing all seats was rejected because the dormant ones have shown no activity for a full window.",
        },
      };
    }
  }

  return {
    ok: true,
    proposal: {
      ...base,
      action: "RENEW",
      amount: bundle.renewal.amount,
      seatCount: seats ? seats.licensed : null,
      rationale: seats
        ? `${bundle.vendor.name} usage is steady at ${seats.active} of ${seats.licensed} seats and the price is unchanged.`
        : `${bundle.vendor.name} renews on unchanged terms.`,
      rejectedAlternative:
        "Reducing the seat count was rejected because dormancy is within a normal range.",
    },
  };
}
