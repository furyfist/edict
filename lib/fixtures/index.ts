import {
  type Actor,
  type EvidenceBundle,
  type LedgerEntry,
  type PolicyRule,
  type PolicyVersion,
  type Proposal,
  type Verdict,
  money,
} from "../contracts";

/**
 * Fixture generators for the five contracts.
 *
 * Every generator is deterministic: ids come from a counter, timestamps come
 * from a fixed base instant, and no generator reads wall time or randomness.
 * Two runs produce byte-identical output, which is what makes fixture-backed
 * UI work reviewable and fixture-backed tests stable.
 *
 * Call `resetFixtures()` between tests.
 */

let counter = 0;

export function resetFixtures(): void {
  counter = 0;
}

function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}_${String(counter).padStart(4, "0")}`;
}

/** Fixed base instant. Fixtures never read the clock. */
export const FIXTURE_EPOCH = "2025-03-01T09:00:00.000Z";

export function fixtureInstant(offsetHours = 0): string {
  const base = Date.parse(FIXTURE_EPOCH);
  return new Date(base + offsetHours * 3_600_000).toISOString();
}

export const ACTORS = {
  agent: { id: "agent:v1", label: "Spend Guardian agent", kind: "AGENT" },
  engine: { id: "engine:policy", label: "Policy engine", kind: "ENGINE" },
  network: { id: "prava", label: "Prava", kind: "NETWORK" },
  system: { id: "system:tick", label: "Tick runner", kind: "SYSTEM" },
  human: { id: "user:finance-lead", label: "Finance lead", kind: "HUMAN" },
} satisfies Record<string, Actor>;

export function fixtureEvidenceBundle(
  overrides: Partial<EvidenceBundle> = {},
): EvidenceBundle {
  const id = nextId("bundle");
  return {
    bundleId: id,
    observedAt: fixtureInstant(),
    vendor: {
      id: "vendor_figma",
      name: "Figma",
      category: "design",
      merchantId: "merchant_figma",
    },
    renewal: {
      id: "renewal_figma_2025_03",
      dueAt: fixtureInstant(48),
      amount: money(45_00),
      cadence: "MONTHLY",
      cycleKey: "2025-03",
    },
    seats: { licensed: 20, active: 18, dormant: 2, windowDays: 30 },
    priceChange: null,
    priorCycleAmount: money(45_00),
    messages: [],
    gaps: [],
    ...overrides,
  };
}

export function fixtureProposal(
  overrides: Partial<Proposal> = {},
): Proposal {
  return {
    proposalId: nextId("proposal"),
    bundleId: "bundle_0001",
    renewalId: "renewal_figma_2025_03",
    proposedAt: fixtureInstant(),
    action: "RENEW",
    amount: money(45_00),
    seatCount: null,
    rationale:
      "Usage is steady at 18 of 20 seats and the price is unchanged from the prior cycle.",
    rejectedAlternative:
      "Reducing to 18 seats was rejected because two dormant seats are within normal onboarding churn.",
    producedBy: "stub",
    ...overrides,
  };
}

export function fixturePolicyRule(
  overrides: Partial<PolicyRule> = {},
): PolicyRule {
  return {
    id: nextId("rule"),
    ordinal: 1,
    effect: "ALLOW_AUTO",
    conditions: [{ field: "AMOUNT", operator: "LTE", value: 50_00 }],
    amountCeiling: 50_00,
    currency: "USD",
    sourceFragment: "Renew anything under $50 automatically.",
    description: "Auto-renew charges at or below $50.00.",
    ...overrides,
  };
}

export function fixturePolicyVersion(
  overrides: Partial<PolicyVersion> = {},
): PolicyVersion {
  return {
    id: nextId("policy"),
    version: 1,
    sourceText: "Renew anything under $50 automatically.",
    rules: [fixturePolicyRule()],
    status: "ACTIVE",
    createdAt: fixtureInstant(),
    activatedAt: fixtureInstant(1),
    activatedBy: ACTORS.human.id,
    ...overrides,
  };
}

export function fixtureVerdict(overrides: Partial<Verdict> = {}): Verdict {
  return {
    bundleId: "bundle_0001",
    proposalId: "proposal_0001",
    renewalId: "renewal_figma_2025_03",
    decision: "ALLOW_AUTO",
    reason: "RULE_MATCHED",
    citedRuleId: "rule_0001",
    citedSourceFragment: "Renew anything under $50 automatically.",
    citedRuleDescription: "Auto-renew charges at or below $50.00.",
    policyVersionId: "policy_0001",
    permittedAmount: money(45_00),
    appliedCeiling: 50_00,
    evidenceGaps: [],
    counterfactual: null,
    ...overrides,
  };
}

export function fixtureLedgerEntry(
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry {
  return {
    id: nextId("entry"),
    recordedAt: fixtureInstant(2),
    tickId: "tick_0001",
    vendorId: "vendor_figma",
    renewalId: "renewal_figma_2025_03",
    cycleKey: "2025-03",
    outcome: "EXECUTED",
    amount: money(45_00),
    decidedBy: ACTORS.agent,
    authorizedBy: ACTORS.engine,
    executedBy: ACTORS.network,
    recordedBy: ACTORS.system,
    decision: "ALLOW_AUTO",
    reason: "RULE_MATCHED",
    citedRuleId: "rule_0001",
    citedSourceFragment: "Renew anything under $50 automatically.",
    policyVersionId: "policy_0001",
    agentRationale:
      "Usage is steady at 18 of 20 seats and the price is unchanged from the prior cycle.",
    agentRejectedAlternative:
      "Reducing to 18 seats was rejected because two dormant seats are within normal onboarding churn.",
    prava: {
      mandateId: "mnd_fixture_0001",
      chargeId: "chg_fixture_0001",
      sessionId: "ses_fixture_0001",
    },
    correctsEntryId: null,
    detail: {},
    ...overrides,
  };
}
