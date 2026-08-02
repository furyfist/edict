import { Badge } from "@/app/_components/ui/badge";
import {
  approvalTone,
  effectTone,
  humanise,
  mandateTone,
  outcomeTone,
  verdictTone,
} from "@/app/_lib/tone";
import type { Outcome } from "@/lib/contracts";

/**
 * The chip family.
 *
 * Every one is a single line on top of `Badge`, passing a tone that came from
 * the tone map. No chip in this file chooses a colour, which is why five chips
 * across seven pages cannot drift from each other.
 *
 * Two rules the vocabularies obey:
 *
 *   Write the consequence, not the enum. "acted", not "EXECUTED"; "needs a
 *   passkey", not "CEILING_RAISE".
 *
 *   Different domains keep different vocabularies. A ledger outcome and a
 *   gauntlet verdict are separate facts, and a chip that blurred them would be
 *   actively misleading rather than merely terse.
 */

/**
 * Ledger outcome. The vocabulary is deliberate: "acted", not "flagged";
 * "refused", not "needs review". Say the agent flagged three items and you are
 * a dashboard. Say it acted on three and refused one and you are an agent.
 */
const OUTCOME_LABEL: Record<Outcome, string> = {
  EXECUTED: "acted",
  ESCALATED: "asked",
  REFUSED: "refused",
  FAILED: "failed",
  HALTED: "halted",
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  return <Badge tone={outcomeTone(outcome)}>{OUTCOME_LABEL[outcome]}</Badge>;
}

/** Policy effect, phrased as what it does to you rather than as its enum. */
const EFFECT_LABEL: Record<string, string> = {
  ALLOW_AUTO: "auto-executes",
  REQUIRE_APPROVAL: "asks you",
  DENY: "refuses",
};

export function EffectChip({ effect }: { effect: string }) {
  return (
    <Badge tone={effectTone(effect)}>{EFFECT_LABEL[effect] ?? humanise(effect)}</Badge>
  );
}

export function ApprovalStatusChip({ status }: { status: string }) {
  return <Badge tone={approvalTone(status)}>{humanise(status)}</Badge>;
}

export function VerdictChip({ verdict }: { verdict: string }) {
  return <Badge tone={verdictTone(verdict)}>{humanise(verdict)}</Badge>;
}

export function MandateStatusChip({ status }: { status: string }) {
  return <Badge tone={mandateTone(status)}>{humanise(status)}</Badge>;
}

/**
 * The loudest chip in the product, and the one that earns its pixels: this
 * approval cannot be satisfied by anyone in this application.
 */
export function NeedsPasskeyChip() {
  return <Badge tone="high">needs a passkey</Badge>;
}

/**
 * A row that did not happen. Rendered wherever constructed boundary cases sit
 * beside real history, because a reader must never mistake a hypothetical for
 * a record.
 */
export function HypotheticalChip() {
  return <Badge tone="neutral">hypothetical</Badge>;
}
