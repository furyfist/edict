import type { Effect, VerdictCode } from "./enums";

/**
 * CONTRACT 4 — Verdict
 *
 * The policy engine's output, and the only thing in this system permitted to
 * say yes.
 *
 * A verdict always cites exactly one rule. That is what makes every action in
 * the ledger traceable to a single sentence the user wrote, and it is why the
 * engine resolves ties by lowest ordinal rather than returning a set.
 *
 * The engine that produces this is a pure function: no I/O, no clock, no
 * randomness, no model. Same inputs, same verdict, forever.
 */

export interface Verdict {
  effect: Effect;

  /**
   * The rule that produced this verdict. Always present — when no authored rule
   * matched, this is the terminal default.
   */
  matchedRuleId: string;
  matchedRuleOrdinal: number;
  /** Echoed so explanations can render the citation without a second lookup. */
  matchedSourceFragment: string;

  /** How the engine got here. Selects the explanation template. */
  code: VerdictCode;

  /**
   * Machine-readable detail for the explanation layer — the ceiling that was
   * exceeded, the completeness flag that was false, and so on. Never prose.
   */
  detail?: Record<string, string | number | boolean | null>;
}
