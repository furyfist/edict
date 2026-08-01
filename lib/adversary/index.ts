/**
 * THE ADVERSARY PLANE.
 *
 * A frozen corpus of attacks, one per defence, planned deterministically and
 * delivered only through surfaces a real attacker holds.
 *
 * Quarantined exactly like `lib/agent`: no import path to `lib/prava`,
 * `lib/ledger`, `lib/policy/engine`, `lib/outcome`, or the database. This module
 * plans attacks and describes them; carrying them out happens outside the wall.
 * Both models in this system — the proposer and the attacker — are jailed by the
 * same rule, and `lib/architecture.test.ts` fails the build if either escapes.
 */

export {
  ATTACK_CLASSES,
  ATTACK_SURFACES,
  CORPUS,
  CORPUS_VERSION,
  classesIn,
  corpusDigest,
  externalEntries,
} from "./corpus";
export type {
  AttackAmount,
  AttackClass,
  AttackEntry,
  AttackPayload,
  AttackPrivilege,
  AttackSurface,
  TargetSelector,
} from "./corpus";

export { planAttack, planCorpus, resolveAmount, selectTarget } from "./plan";
export type { AttackTarget, PlannedAttack } from "./plan";

export {
  createHostileProposer,
  HOSTILE_MODEL_ID,
  HOSTILE_PROMPT_VERSION,
} from "./proposer";
