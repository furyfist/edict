/**
 * The policy engine — pure, deterministic, dependency-free.
 *
 * This directory imports nothing outside itself. That is invariant 3, and it is
 * checked by a test rather than trusted to review.
 */

export { evaluate } from "./evaluate";
export { matchesCondition, matchesRule, resolveField } from "./conditions";
export {
  KNOWN_ACTIONS,
  MONEY_MOVING_ACTIONS,
  TERMINAL_DEFAULT,
  type EngineEvidence,
  type EngineInput,
  type EngineProposal,
  type EngineVerdict,
  type PolicyRule,
  type RuleCondition,
  type RuleEffect,
  type VerdictReason,
} from "./types";
