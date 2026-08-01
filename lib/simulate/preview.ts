import type { Cents, Effect, VerdictCode } from "../contracts";
import type { Battery } from "./battery";
import type { Replay, Scenario, ScenarioOrigin } from "./core";

/**
 * THE PREVIEW — the informed-consent document for delegated authority.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS IS FOR
 *
 * Every other surface in this product explains what the agent DID. This one
 * explains what a policy WOULD DO, at the only moment the answer can still
 * change anything: after the rules are compiled, before a human confirms them.
 *
 * The modal that renders this is where authority is born. A person is about to
 * turn three English sentences into standing permission to move money, and
 * until now the only evidence they had was that the sentences looked right.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SHAPE, AND NOT THE REPLAY ITSELF
 *
 * This is the projection that gets HASHED and signed into the activation record.
 * So it contains exactly what a person could have seen and nothing else: no
 * bundle internals, no seat lists, no timestamps that drift between compiles.
 *
 * The rule is the same one `lib/ledger/record.ts` follows for entries — sign
 * what the reader reconstructs, not what the writer happens to hold. If the
 * preview hash covered fields nobody rendered, "the human saw this" would be a
 * claim about a data structure rather than about a person.
 * ---------------------------------------------------------------------------
 */

export interface PreviewRow {
  scenarioId: string;
  label: string;
  origin: ScenarioOrigin;
  /** Null on real renewals; one line of justification on synthetic ones. */
  note: string | null;

  vendorName: string;
  amountCents: Cents;

  effect: Effect;
  code: VerdictCode;

  /** The rule that decided it, and the words that rule came from. */
  matchedRuleId: string;
  matchedRuleOrdinal: number;
  matchedSourceFragment: string;
}

export interface Preview {
  batteryVersion: string;
  policyVersion: number;
  scenarioCount: number;
  /** Every effect, including the zeroes. A zero is a fact worth rendering. */
  counts: Record<Effect, number>;
  /** Battery order, never verdict order. Grouping is a view, applied above. */
  rows: PreviewRow[];
}

function rowOf(scenario: Scenario, verdict: Replay["verdicts"][number]["verdict"]): PreviewRow {
  return {
    scenarioId: scenario.id,
    label: scenario.label,
    origin: scenario.origin,
    note: scenario.note,

    vendorName: scenario.evidence.vendorName,
    amountCents: scenario.proposal.amountCents,

    effect: verdict.effect,
    code: verdict.code,

    matchedRuleId: verdict.matchedRuleId,
    matchedRuleOrdinal: verdict.matchedRuleOrdinal,
    matchedSourceFragment: verdict.matchedSourceFragment,
  };
}

/**
 * Joins a battery to its replay.
 *
 * Throws on a mismatch rather than rendering a partial preview. A preview whose
 * rows silently disagree with the scenarios they claim to describe is the exact
 * failure this whole plane exists to make impossible, and it must be loud.
 */
export function summarize(battery: Battery, result: Replay): Preview {
  if (battery.scenarios.length !== result.verdicts.length) {
    throw new Error(
      `preview: battery has ${battery.scenarios.length} scenarios but the replay ` +
        `returned ${result.verdicts.length} verdicts. These must be the same run.`,
    );
  }

  const counts: Record<Effect, number> = {
    ALLOW_AUTO: 0,
    REQUIRE_APPROVAL: 0,
    DENY: 0,
  };

  const rows = battery.scenarios.map((scenario, index) => {
    const item = result.verdicts[index];
    if (item.scenarioId !== scenario.id) {
      throw new Error(
        `preview: verdict ${index} is for ${item.scenarioId} but the battery has ` +
          `${scenario.id} at that position.`,
      );
    }
    counts[item.verdict.effect] += 1;
    return rowOf(scenario, item.verdict);
  });

  return {
    batteryVersion: battery.version,
    policyVersion: result.policyVersion,
    scenarioCount: rows.length,
    counts,
    rows,
  };
}

/**
 * The three groups the confirmation modal renders: what this policy would do on
 * its own, what it would bring to you, and what it would refuse outright.
 *
 * A view over `rows`, never a reordering of them — the hashed preview keeps
 * battery order so that two previews of the same battery compare cleanly.
 */
export function groupByEffect(preview: Preview): Array<{
  effect: Effect;
  heading: string;
  rows: PreviewRow[];
}> {
  const headings: Record<Effect, string> = {
    ALLOW_AUTO: "would auto-execute",
    REQUIRE_APPROVAL: "would come to you",
    DENY: "would refuse",
  };

  return (["ALLOW_AUTO", "REQUIRE_APPROVAL", "DENY"] as const).map((effect) => ({
    effect,
    heading: headings[effect],
    rows: preview.rows.filter((row) => row.effect === effect),
  }));
}
