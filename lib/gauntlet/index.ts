/**
 * THE GAUNTLET'S OUTPUT — aggregation, and the signed adversarial record.
 *
 * Downstream of execution and outside the adversary's wall: this module reads
 * what the attacks produced and makes a claim about it. The attacker cannot
 * reach here, which is why the scoreboard is not written by the attacker.
 */

export { summarize, tallyByClass, headlineFor } from "./aggregate";
export { summarizeMatrix } from "./matrix";
export type { ModelMatrix, MatrixRow, ProposerAvailability } from "./matrix";
export type {
  AdversarialSummary,
  ClassTally,
  CompletenessAnchor,
} from "./aggregate";

export { recordGauntlet, latestRecord } from "./record";
export type { AdversarialSubject, StoredAdversarialRecord } from "./record";

export type {
  AttackResult,
  AttackVerdict,
  GauntletRun,
} from "./types";
