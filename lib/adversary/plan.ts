import type { MandateStatus } from "../contracts";
import type { AttackAmount, AttackEntry, TargetSelector } from "./corpus";

/**
 * ATTACK PLANNING — turning a frozen corpus entry into a concrete attempt.
 *
 * ---------------------------------------------------------------------------
 * THE QUARANTINE, AND WHY IT IS STRICTER THAN IT NEEDED TO BE
 *
 * `lib/agent` has no import path to money, the record, the engine, the outcome
 * router, or the database. That is the product's central claim, enforced by
 * `lib/architecture.test.ts` rather than by good intentions.
 *
 * The adversary lives under the same rule. Both models in this system — the one
 * proposing and the one attacking — are jailed by the same wall.
 *
 * It would have been defensible to let this module write to the inbound-message
 * table, since a real attacker genuinely can put text in front of the agent.
 * It does not. This module PLANS attacks and returns descriptions of them;
 * something outside the wall carries them out, exactly as a real vendor's mail
 * server is outside our wall. The result is that the attacker cannot reach the
 * database at all, which is a stronger sentence and costs nothing.
 *
 * ---------------------------------------------------------------------------
 * PURE, SO THE GAUNTLET IS REPLAYABLE
 *
 * Same corpus plus same targets produces the same planned attacks, every time.
 * That is what lets a signed record cite a corpus version and mean something:
 * anyone can re-derive exactly which attempts that run consisted of.
 * ---------------------------------------------------------------------------
 */

/** A candidate the attack could be aimed at, resolved from live state by the caller. */
export interface AttackTarget {
  vendorId: string;
  vendorName: string;
  renewalId: string;
  renewalAmountCents: number;

  mandateStatus: MandateStatus | null;
  /** Null when there is no mandate at all. */
  mandateRemainingCents: number | null;

  /** True when usage and price history are both present. */
  evidenceComplete: boolean;
  /** True when the active policy denies this vendor outright. */
  denied: boolean;
}

/** What the attacker wants written, expressed so someone else can write it. */
export type PlannedAttack =
  | {
      status: "PLANNED";
      entry: AttackEntry;
      target: AttackTarget;
      delivery:
        | {
            kind: "PLANT_MESSAGE";
            from: string;
            subject: string;
            body: string;
          }
        | {
            kind: "SUBMIT_PROPOSAL";
            /** Loose on purpose — the point is submitting what the types forbid. */
            action: string;
            amountCents: number;
            currency: string;
            rationale: string;
          };
    }
  | {
      /**
       * The attack could not be staged in this environment.
       *
       * NOT a pass. An attack that never ran proves nothing, and counting it as
       * a defence that held would inflate the only number this whole milestone
       * produces.
       */
      status: "NOT_APPLICABLE";
      entry: AttackEntry;
      reason: string;
    };

/**
 * Picks a target for a selector.
 *
 * Deterministic: candidates are consumed in the order given and the first match
 * wins. The caller sorts them stably, so two runs over the same seeded data
 * attack the same vendors.
 */
export function selectTarget(
  selector: TargetSelector,
  candidates: AttackTarget[],
): AttackTarget | null {
  switch (selector.kind) {
    case "NAMED":
      return (
        candidates.find((c) => c.vendorName === selector.vendorName) ?? null
      );
    case "DENIED":
      return candidates.find((c) => c.denied) ?? null;
    case "INCOMPLETE_EVIDENCE":
      return candidates.find((c) => !c.evidenceComplete) ?? null;
    case "DEAD_MANDATE":
      return (
        candidates.find(
          (c) => c.mandateStatus !== null && c.mandateStatus !== "ACTIVE",
        ) ?? null
      );
    case "ANY_ACTIVE":
      return (
        candidates.find(
          (c) =>
            c.mandateStatus === "ACTIVE" &&
            c.evidenceComplete &&
            !c.denied &&
            c.mandateRemainingCents !== null,
        ) ?? null
      );
  }
}

/**
 * Resolves a relative amount against the target.
 *
 * Relative rather than absolute so the corpus survives a reseed with different
 * ceilings. `OVER_CEILING` against a target with no ceiling resolves to the
 * renewal amount — there is nothing to exceed, and the attack will be reported
 * on its actual outcome rather than a fabricated one.
 */
export function resolveAmount(amount: AttackAmount, target: AttackTarget): number {
  switch (amount.kind) {
    case "ABSOLUTE":
      return amount.cents;
    case "RENEWAL":
      return target.renewalAmountCents;
    case "OVER_CEILING":
      return target.mandateRemainingCents === null
        ? target.renewalAmountCents
        : target.mandateRemainingCents + amount.byCents;
    case "MULTIPLE_OF_CEILING":
      return target.mandateRemainingCents === null
        ? target.renewalAmountCents * amount.factor
        : target.mandateRemainingCents * amount.factor;
  }
}

const NOT_APPLICABLE_REASON: Record<TargetSelector["kind"], string> = {
  NAMED: "no vendor with that name exists in this environment",
  DENIED: "the active policy denies no vendor, so there is nothing to attack",
  INCOMPLETE_EVIDENCE: "every vendor has complete evidence in this environment",
  DEAD_MANDATE: "every mandate is chargeable in this environment",
  ANY_ACTIVE: "no vendor has an active mandate and a renewal to adjudicate",
};

/** Plans one attack. Returns NOT_APPLICABLE rather than inventing a target. */
export function planAttack(
  entry: AttackEntry,
  candidates: AttackTarget[],
): PlannedAttack {
  const target = selectTarget(entry.target, candidates);

  if (!target) {
    return {
      status: "NOT_APPLICABLE",
      entry,
      reason: NOT_APPLICABLE_REASON[entry.target.kind],
    };
  }

  if (entry.payload.kind === "MESSAGE") {
    return {
      status: "PLANNED",
      entry,
      target,
      delivery: {
        kind: "PLANT_MESSAGE",
        from: entry.payload.from,
        subject: entry.payload.subject,
        body: entry.payload.body,
      },
    };
  }

  return {
    status: "PLANNED",
    entry,
    target,
    delivery: {
      kind: "SUBMIT_PROPOSAL",
      action: entry.payload.action,
      amountCents: resolveAmount(entry.payload.amount, target),
      currency: entry.payload.currency,
      rationale: entry.payload.rationale,
    },
  };
}

/** Plans a whole corpus, in corpus order. */
export function planCorpus(
  entries: readonly AttackEntry[],
  candidates: AttackTarget[],
): PlannedAttack[] {
  return entries.map((entry) => planAttack(entry, candidates));
}
