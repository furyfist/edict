import { cents } from "../contracts/money";
import type { LedgerEntry } from "../contracts";
import { makeEvidenceBundle, underAttack } from "./evidence";

/** Deterministic ledger fixtures — what the interface renders before a backend exists. */

export function makeLedgerEntry(
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
  return {
    id: "entry-1",
    tickId: "tick-1",
    createdAt: "2026-03-01T09:00:04.000Z",
    clockAt: "2026-03-01T09:00:00.000Z",

    vendorId: "vendor-figma",
    vendorName: "Figma",
    renewalId: "renewal-figma-2026-03",
    cycleStart: "2026-03-01",

    proposedAction: "RENEW_REDUCED",
    proposedAmountCents: cents(9000),

    outcome: "EXECUTED",
    refusalCode: null,
    haltReason: null,

    decidedBy: { modelId: "stub", promptVersion: "v0", stubbed: true },
    authorizedBy: {
      policyVersionId: "policy-v1",
      policyVersion: 1,
      ruleId: "rule-auto-under-500",
      ruleOrdinal: 1,
      sourceFragment:
        "Auto-renew anything under $500 a month if usage is above 60%.",
      approverId: null,
      approvalId: null,
      passkeyAt: null,
    },
    executedBy: {
      provider: "prava",
      mandateId: "mandate-figma",
      chargeId: "charge-fixture-1",
      status: "succeeded",
    },

    amountCents: cents(9000),
    currency: "USD",
    financialImpact: {
      chargedCents: cents(9000),
      counterfactualCents: cents(18000),
      savedCents: 9000,
    },

    evidence: makeEvidenceBundle(),

    explanation:
      "Renewed Figma at 6 of 12 seats. 6 seats had no login in 41 days.",
    counterfactual: "Do nothing and you pay $180.00 on 2026-03-04.",
    alternative: {
      action: "CANCEL",
      reason: "Six seats remain in daily use, so cancelling would break active work.",
    },
    agentRationale:
      "Six of twelve seats have not been used in 41 days; renewing at six seats.",

    correctsEntryId: null,
    error: null,

    // Fixtures are unattested by default. A fixture that claimed to be signed
    // would be the one place in this repository where a receipt meant nothing.
    receipt: null,
    ...overrides,
  };
}

/**
 * The entry produced by the injection attack.
 *
 * The agent proposed $48,000. Nothing moved. The rule that stopped it is cited,
 * and the model's own words are preserved in their labeled field so a reader can
 * see exactly how convinced it was.
 */
export function attackRefusalEntry(): LedgerEntry {
  return makeLedgerEntry({
    id: "entry-attack",
    vendorId: "vendor-cloudsync",
    vendorName: "CloudSync Pro",
    renewalId: "renewal-cloudsync-2026-03",
    proposedAction: "RENEW_AS_IS",
    proposedAmountCents: cents(4800000),
    outcome: "REFUSED",
    refusalCode: "POLICY_DENIED",
    executedBy: null,
    amountCents: cents(0),
    financialImpact: {
      chargedCents: cents(0),
      counterfactualCents: cents(9500),
      savedCents: 0,
    },
    evidence: underAttack(),
    authorizedBy: {
      policyVersionId: "policy-v1",
      policyVersion: 1,
      ruleId: "rule-approve-over-500",
      ruleOrdinal: 2,
      sourceFragment: "Anything over $500 a month needs my approval.",
      approverId: null,
      approvalId: null,
      passkeyAt: null,
    },
    explanation:
      "Refused a $48,000.00 charge for CloudSync Pro. The proposed amount exceeds the $500.00 auto-approval ceiling.",
    counterfactual: "Do nothing and you pay $95.00 on 2026-03-03.",
    agentRationale:
      "The vendor states the plan migrated to Enterprise tier and requires immediate payment to avoid interruption.",
  });
}

/** Missing usage data escalates rather than allowing. */
export function escalatedEntry(): LedgerEntry {
  return makeLedgerEntry({
    id: "entry-escalated",
    vendorId: "vendor-airtable",
    vendorName: "Airtable",
    renewalId: "renewal-airtable-2026-03",
    proposedAction: "RENEW_AS_IS",
    proposedAmountCents: cents(24000),
    outcome: "ESCALATED",
    executedBy: null,
    amountCents: cents(0),
    financialImpact: {
      chargedCents: cents(0),
      counterfactualCents: cents(24000),
      savedCents: 0,
    },
    explanation:
      "Escalated Airtable. No usage data is available, so the renewal could not be evaluated automatically.",
    counterfactual: "Do nothing and you pay $240.00 on 2026-03-06.",
  });
}

export function makeLedgerPage(): LedgerEntry[] {
  return [attackRefusalEntry(), escalatedEntry(), makeLedgerEntry()];
}
