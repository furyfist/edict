import type { EvidenceBundle, Proposal } from "../contracts";

/**
 * The agent boundary.
 *
 * NOTE WHAT THIS MODULE DOES NOT IMPORT: `lib/prava`, `lib/ledger`, and
 * `lib/policy/engine` are all absent, and they stay absent. The language model
 * has no path to money, no path to the record, and no path to the component
 * that grants permission. That is enforced by the dependency graph, which a
 * prompt-injected model cannot argue with.
 *
 * The agent's entire output is a Proposal — advisory, discardable, and not an
 * instruction to anything.
 */

export interface AgentInput {
  evidence: EvidenceBundle;
  /** The policy as reference text. The agent reads it; it never edits it. */
  policyText: string;
}

export type AgentResult =
  | { ok: true; proposal: Proposal }
  | {
      ok: false;
      /**
       * MALFORMED — output did not satisfy the contract. Becomes a refusal.
       *             Never retried with a softer prompt.
       * UNAVAILABLE — the model could not be reached. Halts the tick.
       */
      reason: "MALFORMED" | "UNAVAILABLE";
      message: string;
    };

export interface Agent {
  /**
   * `hostile` is the gauntlet's attacker-controlled proposer. It is listed here
   * because the type must admit it, and it is named rather than disguised: an
   * adversarial proposal is attributable in the ledger like any other.
   */
  readonly name: "stub" | "llm" | "hostile";
  /** Recorded in the ledger's `decidedBy` field. */
  readonly modelId: string;
  readonly promptVersion: string;
  readonly stubbed: boolean;

  propose(input: AgentInput): Promise<AgentResult>;
}
