import type { EvidenceBundle, ProposalResult } from "../contracts";
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

export async function propose(
  bundle: EvidenceBundle,
): Promise<ProposalResult> {
  return stubPropose(bundle);
}

export { stubPropose } from "./stub";
