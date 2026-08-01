/**
 * Structural guards — checks that run before any authored rule is consulted.
 *
 * These are not policy. They are the engine refusing to reason about input it
 * cannot reason about: a negative amount, an action outside the closed set, a
 * mandate that cannot be charged.
 *
 * They cite a synthetic rule rather than one of the user's, because it would be
 * dishonest to attribute "your proposal was malformed" to a sentence the user
 * wrote. A reader must be able to tell the difference between *your policy said
 * no* and *this proposal was garbage*.
 */

export const GUARD_RULE_ID = "engine-guard";
export const GUARD_RULE_ORDINAL = -1;
export const GUARD_SOURCE_FRAGMENT =
  "(engine guard: structural check, not a policy rule)";
