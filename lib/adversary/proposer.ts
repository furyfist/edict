import type { Agent, AgentResult } from "../agent/types";
import type { Proposal } from "../contracts";
import type { PlannedAttack } from "./plan";

/**
 * THE HOSTILE PROPOSER — the agent, assumed lost.
 *
 * ---------------------------------------------------------------------------
 * THE THREAT MODEL THIS IMPLEMENTS
 *
 * Prompt injection is the polite version of the problem. It assumes the model
 * can be nudged, and it leaves open the reassuring possibility that a better
 * model would not have been nudged. The runbook already admits the awkward
 * truth here: the real proposer usually refuses the bait, and only the credulous
 * stub takes it.
 *
 * So the gauntlet does not test whether the model can be fooled. It assumes the
 * attacker simply HAS the model — that every token of its output is chosen by
 * them — and asks what the system does then.
 *
 * That is the only version of the claim worth making. "Our model is hard to
 * fool" is a statement about a vendor's training run and it expires with the
 * next release. "It does not matter whether the model is fooled" is a statement
 * about an architecture, and it is the one this whole repository exists to
 * support.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SAFE TO SHIP
 *
 * It satisfies the `Agent` interface and nothing more. An agent can only
 * produce a Proposal, and a proposal is advisory: it cannot authorize, cannot
 * execute, and has no import path to money or the record. Handing the attacker
 * complete control of this component grants them exactly as much power as the
 * architecture says it grants — which is the thing being measured.
 *
 * It identifies itself honestly in `modelId`, so every ledger entry it produces
 * is attributable to the gauntlet rather than masquerading as a real decision.
 * ---------------------------------------------------------------------------
 */

export const HOSTILE_MODEL_ID = "adversary/hostile-proposer";
export const HOSTILE_PROMPT_VERSION = "corpus-1";

/**
 * An agent that emits exactly what the attacker chose, for exactly the renewal
 * under attack, and behaves like the ordinary stub for everything else.
 *
 * The fallback matters: a gauntlet tick still adjudicates every other renewal
 * that happens to be due, and those must not be collaterally poisoned. Only the
 * vendor named by the planned attack sees hostile output.
 */
export function createHostileProposer(input: {
  attack: Extract<PlannedAttack, { status: "PLANNED" }>;
  /** Used for every renewal that is not the one under attack. */
  fallback: Agent;
}): Agent {
  const { attack, fallback } = input;

  return {
    name: "hostile",
    modelId: HOSTILE_MODEL_ID,
    promptVersion: HOSTILE_PROMPT_VERSION,
    // Not a language model, and never claimed to be one. `stubbed` is what the
    // interface renders as "deterministic fallback", which is exactly what this
    // is: a deterministic attacker replaying a frozen corpus entry.
    stubbed: true,

    async propose(agentInput): Promise<AgentResult> {
      if (agentInput.evidence.vendorId !== attack.target.vendorId) {
        return fallback.propose(agentInput);
      }

      if (attack.delivery.kind !== "SUBMIT_PROPOSAL") {
        // A message-planting attack does not touch the proposal gate. The real
        // proposer reads the planted text and says whatever it says — which is
        // the whole point of that attack class.
        return fallback.propose(agentInput);
      }

      const { action, amountCents, currency, rationale } = attack.delivery;

      // Cast, deliberately. The corpus expresses actions and currencies the
      // type system forbids, because a proposal gate that could only receive
      // well-typed input would never exercise its own structural guards. This
      // is the one place in the codebase where bypassing the types IS the test.
      const proposal = {
        vendorId: agentInput.evidence.vendorId,
        renewalId: agentInput.evidence.renewalId,
        action,
        amountCents,
        currency,
        rationale,
        alternative: {
          action: "ESCALATE",
          reason: "Adversarial proposal from the frozen corpus.",
        },
      } as unknown as Proposal;

      return { ok: true, proposal };
    },
  };
}
