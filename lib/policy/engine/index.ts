import { ACTIONS, CURRENCY, isChargeable } from "../../contracts";
import type {
  EvidenceBundle,
  Policy,
  PolicyRule,
  Proposal,
  Verdict,
} from "../../contracts";
import { GUARD_RULE_ID, GUARD_RULE_ORDINAL, GUARD_SOURCE_FRAGMENT } from "./guards";
import { byOrdinal, ruleMatches } from "./match";

/**
 * THE POLICY ENGINE — the only component permitted to say yes.
 *
 * This module is a pure function. No I/O, no database, no network, no clock, no
 * randomness, no language model. It imports only `lib/contracts`, which is
 * itself pure types and constants. Same inputs, same verdict, forever.
 *
 * That purity is not tidiness. It is what makes "the language model is never the
 * last line of defense" a true statement rather than a slogan, and it is why
 * this is the one module in the project with exhaustive tests.
 *
 * ---------------------------------------------------------------------------
 * THE CRITICAL PROPERTY
 *
 * The engine reads facts from the EVIDENCE BUNDLE. It never reads factual claims
 * from the proposal. The model may assert that usage is 95%; the engine reads
 * 50% from the bundle and rules accordingly.
 *
 * This is exactly what defeats prompt injection. A model that has been
 * manipulated into proposing a $48,000 payment produces a proposal — and a
 * proposal is not an authorization.
 * ---------------------------------------------------------------------------
 *
 * EVALUATION ORDER
 *
 *   1. Structural guards      malformed input cannot be reasoned about
 *   2. Pass 1 — DENY rules    prohibitions are absolute, regardless of position
 *   3. Authority checks       no mandate, or a mandate that cannot be charged
 *   4. Evidence completeness  unknown is never permission
 *   5. Mandate ceiling        over the cap means a human and a passkey
 *   6. Pass 2 — first match   ordinal order, first match wins
 *   7. Terminal default       REQUIRE_APPROVAL
 *
 * Two passes rather than one because "never" means never regardless of where it
 * was written. A DENY at ordinal 9 defeats an ALLOW_AUTO at ordinal 1 — ordering
 * cannot defeat a prohibition. Everything else is a readable ordered list.
 *
 * Every path cites exactly one rule.
 */

export interface EngineInput {
  proposal: Proposal;
  evidence: EvidenceBundle;
  policy: Policy;
}

function guardVerdict(
  effect: Verdict["effect"],
  code: Verdict["code"],
  detail?: Verdict["detail"],
): Verdict {
  return {
    effect,
    matchedRuleId: GUARD_RULE_ID,
    matchedRuleOrdinal: GUARD_RULE_ORDINAL,
    matchedSourceFragment: GUARD_SOURCE_FRAGMENT,
    code,
    detail,
  };
}

function ruleVerdict(
  rule: PolicyRule,
  code: Verdict["code"],
  detail?: Verdict["detail"],
): Verdict {
  return {
    effect: rule.effect,
    matchedRuleId: rule.id,
    matchedRuleOrdinal: rule.ordinal,
    matchedSourceFragment: rule.sourceFragment,
    code,
    detail,
  };
}

export function evaluate(input: EngineInput): Verdict {
  const { proposal, evidence, policy } = input;
  const rules = byOrdinal(policy.rules);

  // -- 1. Structural guards ------------------------------------------------
  // Garbage in is refused, not interpreted.

  if (!(ACTIONS as readonly string[]).includes(proposal.action)) {
    return guardVerdict("DENY", "MALFORMED_PROPOSAL", {
      reason: "action outside the permitted set",
      action: String(proposal.action),
    });
  }

  if (
    typeof proposal.amountCents !== "number" ||
    !Number.isInteger(proposal.amountCents) ||
    proposal.amountCents <= 0
  ) {
    return guardVerdict("DENY", "MALFORMED_PROPOSAL", {
      reason: "amount must be a positive integer number of cents",
      amountCents: Number(proposal.amountCents),
    });
  }

  if (proposal.currency !== CURRENCY) {
    return guardVerdict("DENY", "UNSUPPORTED_CURRENCY", {
      currency: String(proposal.currency),
    });
  }

  // -- 2. Pass 1: prohibitions are absolute --------------------------------
  // Evaluated before everything below so that no ordering, and no other
  // consideration, can defeat a DENY the user wrote.

  for (const rule of rules) {
    if (rule.effect !== "DENY") continue;
    if (ruleMatches(rule, proposal, evidence)) {
      return ruleVerdict(rule, "RULE_MATCHED");
    }
  }

  // -- 3. Authority ---------------------------------------------------------
  // Spend outside the agent's authority is not something policy can permit.

  if (!evidence.completeness.hasMandate || evidence.mandate.mandateId === null) {
    return guardVerdict("DENY", "NO_MANDATE", { vendorId: evidence.vendorId });
  }

  const status = evidence.mandate.status;
  if (status === null || !isChargeable(status)) {
    return guardVerdict("DENY", "MANDATE_NOT_CHARGEABLE", {
      status: status ?? "unknown",
    });
  }

  // -- 4. Evidence completeness --------------------------------------------
  // Unknown is never permission. A gap reaches a human, every time.

  if (!evidence.completeness.hasUsageData) {
    return guardVerdict("REQUIRE_APPROVAL", "EVIDENCE_INCOMPLETE", {
      missing: "usage data",
    });
  }

  if (!evidence.completeness.hasPriceHistory) {
    return guardVerdict("REQUIRE_APPROVAL", "EVIDENCE_INCOMPLETE", {
      missing: "price history",
    });
  }

  // -- 5. Mandate ceiling ---------------------------------------------------
  // Exceeding the ceiling is not a policy question. It requires new authority,
  // which requires a human and a passkey. There is no override path.

  const remaining = evidence.mandate.remainingCents;
  if (remaining !== null && proposal.amountCents > remaining) {
    return guardVerdict("REQUIRE_APPROVAL", "OVER_MANDATE_CEILING", {
      amountCents: proposal.amountCents,
      remainingCents: remaining,
    });
  }

  // -- 6. Pass 2: first match wins -----------------------------------------

  for (const rule of rules) {
    if (rule.effect === "DENY") continue; // already evaluated in pass 1
    if (ruleMatches(rule, proposal, evidence)) {
      return ruleVerdict(rule, "RULE_MATCHED");
    }
  }

  // -- 7. Terminal default --------------------------------------------------
  // Unreachable when the compiler has appended its terminal rule, which always
  // matches. Kept because the engine must never fall off the end, and because
  // a policy assembled by hand in a test might omit it.

  const last = rules[rules.length - 1];
  if (last) {
    return {
      effect: "REQUIRE_APPROVAL",
      matchedRuleId: last.id,
      matchedRuleOrdinal: last.ordinal,
      matchedSourceFragment: last.sourceFragment,
      code: "NO_RULE_MATCHED",
    };
  }

  return guardVerdict("REQUIRE_APPROVAL", "NO_RULE_MATCHED", {
    reason: "policy contains no rules",
  });
}

export { GUARD_RULE_ID, GUARD_RULE_ORDINAL, GUARD_SOURCE_FRAGMENT } from "./guards";
export { ruleMatches, scopeMatches, conditionsMatch, byOrdinal } from "./match";
