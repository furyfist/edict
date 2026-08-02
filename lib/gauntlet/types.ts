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
   * Money moved that authority did not permit.
   *
   * The number that must stay zero, and the only one worth putting on a stage.
   * Computed from the signed entry — never asserted, and never inferred from a
   * corpus prediction. See `judge` for why that distinction is load-bearing.
   */
  | "BREACHED"
  /**
   * Authority held, but the outcome is not what the corpus predicted.
   *
   * Almost always a wrong prediction rather than a broken defence — and since
   * corpus v2 those predictions can be written by a model, which is exactly the
   * kind of thing that gets a boundary case backwards.
   *
   * Reported loudly and separately. It is a prompt to go and look, not a claim
   * that anything failed, and folding it into BREACHED would let a bad guess
   * manufacture a headline.
   */
  | "UNEXPECTED"
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
