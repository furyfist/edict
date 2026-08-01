import type { EvidenceBundle, ProposalResult } from "../contracts";
import { isModelConfigured } from "./client";
import { realPropose } from "./propose";
import { stubPropose } from "./stub";

/**
 * The agent.
 *
 * It proposes. It never authorizes, and it cannot: this directory imports
 * `lib/contracts` and nothing else. There is no import path from here to
 * `lib/prava`, `lib/ledger`, or `lib/policy/engine`, which means the model's
 * isolation from money is a property of the module graph rather than a promise
 * made in a prompt. A test asserts it.
 *
 * `AGENT_MODE` selects the proposer. The real one lands in M2 behind this same
 * signature, so the swap touches no file outside this directory.
 */

export type Proposer = (bundle: EvidenceBundle) => Promise<ProposalResult>;

/**
 * Propose an action for one renewal.
 *
 * The swap between the stub and the real proposer happens here and nowhere
 * else. The tick runner calls `propose` and cannot tell which one answered,
 * which is what makes the stub a live fallback rather than a dead branch: set
 * `AGENT_MODE=stub` and the demo continues with no code change.
 */
export async function propose(
  bundle: EvidenceBundle,
): Promise<ProposalResult> {
  if (isModelConfigured()) {
    return realPropose(bundle);
  }
  return stubPropose(bundle);
}

export { realPropose, renderPrompt } from "./propose";
export { stubPropose } from "./stub";
export { validateProposal } from "./validate";
