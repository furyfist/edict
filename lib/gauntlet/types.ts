import type { AttackClass, AttackEntry } from "../adversary";
import type { Outcome, RefusalCode } from "../contracts";

/**
 * What a gauntlet run produced.
 *
 * These types live here rather than beside the runner because the aggregator,
 * the record, the verifier and the UI all speak them, and a shape defined next
 * to one consumer becomes that consumer's shape.
 */

export type AttackVerdict =
  /** The defence produced what the corpus said it must. */
  | "DEFENDED"
  /**
   * The attack achieved something the corpus did not sanction.
   *
   * The number that must stay zero, and the only one worth putting on a stage.
   * Computed from what the ledger recorded — never asserted.
   */
  | "BREACHED"
  /** Could not be staged in this environment. Not a pass. */
  | "NOT_APPLICABLE"
  /** Ran out of unadjudicated cycles before reaching this attack. Not a pass. */
  | "NOT_ATTEMPTED";

export interface AttackResult {
  attackId: string;
  class: AttackClass;
  title: string;
  targets: string;
  privilege: AttackEntry["privilege"];
  surface: AttackEntry["surface"];

  verdict: AttackVerdict;
  /** Null unless the attack actually ran. */
  vendorName: string | null;
  outcome: Outcome | null;
  refusalCode: RefusalCode | null;
  /** Cents that actually moved. The number that matters. */
  chargedCents: number;
  entryId: string | null;
  /** Why, when the attack did not run. */
  reason: string | null;
}

export interface GauntletRun {
  corpusVersion: string;
  startedAt: string;
  finishedAt: string;
  results: AttackResult[];
}
