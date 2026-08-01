import type { Cents, Effect, VerdictCode } from "../contracts";
import type { Battery } from "./battery";
import type { Replay, ScenarioOrigin } from "./core";

/**
 * THE BEHAVIORAL DIFF — a policy change, rendered as an authority change.
 *
 * ---------------------------------------------------------------------------
 * WHY A TEXT DIFF IS THE WRONG ANSWER
 *
 * Two policy versions differ by some English and some rules, and both are easy
 * to show. Neither answers the question a person actually has, which is:
 *
 *     "What can this agent do now that it could not do before?"
 *
 * A one-word edit can hand over thousands of dollars of standing authority, and
 * a paragraph of rewriting can change nothing at all. Rule diffs are no better —
 * a changed ordinal reads as a large edit and usually means nothing, while a
 * changed ceiling reads as a small one and is the whole story.
 *
 * So the diff is taken over VERDICTS. Same battery, two policies, and the answer
 * is the set of scenarios whose outcome moved. That is the only diff that
 * measures the thing anyone cares about.
 *
 * Free, once the replayer exists: it is two replays and a comparison.
 * ---------------------------------------------------------------------------
 */

export interface VerdictSide {
  effect: Effect;
  code: VerdictCode;
  matchedRuleOrdinal: number;
  matchedSourceFragment: string;
}

export interface VerdictChange {
  scenarioId: string;
  label: string;
  origin: ScenarioOrigin;
  vendorName: string;
  amountCents: Cents;
  before: VerdictSide;
  after: VerdictSide;
}

export interface BehavioralDiff {
  fromVersion: number;
  toVersion: number;
  batteryVersion: string;
  scenarioCount: number;

  /**
   * The three sentences a reader wants, counted.
   *
   * `gainedAutonomy` is the one that matters: scenarios the agent may now
   * execute alone that previously needed a human or were refused. It is listed
   * first everywhere it is rendered, because it is the only direction of change
   * that can cost someone money.
   */
  summary: {
    gainedAutonomy: number;
    lostAutonomy: number;
    newlyRefused: number;
    otherChanges: number;
    unchanged: number;
  };

  /** Only the scenarios that moved. Battery order. */
  changes: VerdictChange[];
}

function sideOf(verdict: Replay["verdicts"][number]["verdict"]): VerdictSide {
  return {
    effect: verdict.effect,
    code: verdict.code,
    matchedRuleOrdinal: verdict.matchedRuleOrdinal,
    matchedSourceFragment: verdict.matchedSourceFragment,
  };
}

/**
 * Diffs two replays of the SAME battery.
 *
 * Throws if the two runs are not over the same scenarios. A diff between
 * different batteries would be measuring the battery, and it would look exactly
 * like a policy change while being nothing of the kind.
 */
export function diffReplays(
  battery: Battery,
  before: Replay,
  after: Replay,
): BehavioralDiff {
  if (
    battery.scenarios.length !== before.verdicts.length ||
    battery.scenarios.length !== after.verdicts.length
  ) {
    throw new Error(
      "diff: both replays must cover the same battery, scenario for scenario.",
    );
  }

  const summary = {
    gainedAutonomy: 0,
    lostAutonomy: 0,
    newlyRefused: 0,
    otherChanges: 0,
    unchanged: 0,
  };

  const changes: VerdictChange[] = [];

  for (const [index, scenario] of battery.scenarios.entries()) {
    const wasVerdict = before.verdicts[index];
    const nowVerdict = after.verdicts[index];

    if (wasVerdict.scenarioId !== scenario.id || nowVerdict.scenarioId !== scenario.id) {
      throw new Error(
        `diff: scenario ${scenario.id} is not at position ${index} in both replays.`,
      );
    }

    const was = sideOf(wasVerdict.verdict);
    const now = sideOf(nowVerdict.verdict);

    // Effect is what "behaviour" means here. A different rule reaching the same
    // effect is a change in ATTRIBUTION, not in authority — worth showing in the
    // row, not worth counting as a behavioural change.
    if (was.effect === now.effect) {
      summary.unchanged += 1;
      continue;
    }

    if (now.effect === "ALLOW_AUTO") summary.gainedAutonomy += 1;
    else if (was.effect === "ALLOW_AUTO") summary.lostAutonomy += 1;
    else if (now.effect === "DENY") summary.newlyRefused += 1;
    else summary.otherChanges += 1;

    changes.push({
      scenarioId: scenario.id,
      label: scenario.label,
      origin: scenario.origin,
      vendorName: scenario.evidence.vendorName,
      amountCents: scenario.proposal.amountCents,
      before: was,
      after: now,
    });
  }

  return {
    fromVersion: before.policyVersion,
    toVersion: after.policyVersion,
    batteryVersion: battery.version,
    scenarioCount: battery.scenarios.length,
    summary,
    changes,
  };
}
