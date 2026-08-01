import { evaluate } from "../policy/engine";
import type { Effect, EvidenceBundle, Policy, Proposal, Verdict } from "../contracts";

/**
 * THE REPLAYER — determinism promoted from a tested property to an operational
 * capability.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS MODULE EXISTS
 *
 * The engine has always been a pure function, and until now that purity was
 * something the test suite checked and nobody used. Three capabilities that
 * look unrelated turn out to be the same operation over that function:
 *
 *   preview   — replay a scenario set under a policy that does not exist yet
 *   diff      — replay the same set under two versions and compare verdicts
 *   history   — replay the recorded past from its frozen evidence
 *
 * All three are: take (evidence, proposal) pairs, take a policy, produce
 * verdicts. One replayer, three input sources. Building them as three features
 * would have been three chances to disagree about what the engine decided.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS NOT
 *
 * It is not a second engine, and it must never become one. It calls `evaluate`
 * and does nothing else with the answer. The moment this module contains a rule,
 * a threshold, or a special case, the preview stops describing the system and
 * starts describing itself — and a preview that can disagree with the engine is
 * worse than no preview at all.
 *
 * That is why it is pure: no I/O, no clock, no randomness, no model, and an
 * import list of exactly `lib/policy/engine` and `lib/contracts`. The
 * architecture test enforces it. The simulation plane inherits the purity it
 * advertises rather than promising it.
 * ---------------------------------------------------------------------------
 */

/**
 * Where a scenario came from. Rendered in the preview, because a synthetic
 * scenario is a hypothetical and must never be mistaken for something that
 * happened.
 */
export type ScenarioOrigin = "history" | "synthetic";

export interface Scenario {
  /** Stable across runs. Two builds of the same battery produce the same ids. */
  id: string;
  /** One line, human-readable. What a person sees in the preview table. */
  label: string;
  origin: ScenarioOrigin;
  /**
   * Why this scenario is in the battery. Present on synthetic scenarios and
   * null on historical ones, whose justification is that they occurred.
   */
  note: string | null;

  evidence: EvidenceBundle;
  /**
   * The proposal under test.
   *
   * On a synthetic scenario this is CONSTRUCTED, not produced by the model —
   * the preview is a statement about authority, not about what any particular
   * model would say. `lib/simulate/battery.ts` says so in the rationale text it
   * writes, so the distinction survives into anything that renders it.
   */
  proposal: Proposal;
}

export interface ScenarioVerdict {
  scenarioId: string;
  verdict: Verdict;
}

export interface Replay {
  policyId: string;
  policyVersion: number;
  /** Same order as the scenarios given. Order is data, never sorted here. */
  verdicts: ScenarioVerdict[];
}

/**
 * Replay a scenario set under one policy.
 *
 * Pointwise and independent: scenario N cannot influence scenario N+1, because
 * the engine has no state to carry between them. That independence is what makes
 * a battery a measurement rather than a simulation of a session.
 */
export function replay(input: { scenarios: Scenario[]; policy: Policy }): Replay {
  return {
    policyId: input.policy.id,
    policyVersion: input.policy.version,
    verdicts: input.scenarios.map((scenario) => ({
      scenarioId: scenario.id,
      verdict: evaluate({
        proposal: scenario.proposal,
        evidence: scenario.evidence,
        policy: input.policy,
      }),
    })),
  };
}

/** Verdict counts by effect. Every effect is present, including the zeroes. */
export function countByEffect(result: Replay): Record<Effect, number> {
  const counts: Record<Effect, number> = {
    ALLOW_AUTO: 0,
    REQUIRE_APPROVAL: 0,
    DENY: 0,
  };
  for (const item of result.verdicts) counts[item.verdict.effect] += 1;
  return counts;
}
