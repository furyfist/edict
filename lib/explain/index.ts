import { formatCents } from "../contracts/money";
import type {
  EvidenceBundle,
  LedgerEntry,
  Outcome,
  Proposal,
  RefusalCode,
  Verdict,
} from "../contracts";

/**
 * Deterministic explanation templates.
 *
 * NO LANGUAGE MODEL TOUCHES THIS FILE, and that is a deliberate inversion for
 * an AI project.
 *
 * Uniform structure is what makes an explanation read as a system. Prose that
 * varies in shape between entries is the visible fingerprint of a model
 * improvising, and in a ledger that is exactly the wrong signal. Templates are
 * also instant, free, and impossible to hallucinate.
 *
 * The model writes the vendor email, where variation is a virtue. It does not
 * write the audit line.
 */

// ---------------------------------------------------------------------------
// Write-side — rendered once, stored on the entry
// ---------------------------------------------------------------------------

export function reasonFor(verdict: Verdict): string {
  switch (verdict.code) {
    case "EVIDENCE_INCOMPLETE":
      return `Missing ${String(verdict.detail?.missing ?? "evidence")}, so it could not be evaluated automatically.`;
    case "OVER_MANDATE_CEILING":
      return "The amount exceeds the authorized ceiling, which requires a new approval.";
    case "MALFORMED_PROPOSAL":
      return "The proposal did not meet the output contract.";
    case "UNSUPPORTED_CURRENCY":
      return "The currency is not supported.";
    case "NO_MANDATE":
      return "This vendor has no mandate, so it is outside the agent's authority.";
    case "MANDATE_NOT_CHARGEABLE":
      return `The mandate is ${String(verdict.detail?.status ?? "not active").toLowerCase()}.`;
    case "NO_RULE_MATCHED":
      return "No rule covered this, so it was sent to you.";
    default:
      return `Matched: "${verdict.matchedSourceFragment}"`;
  }
}

export function explainOutcome(input: {
  outcome: Outcome;
  verdict: Verdict;
  proposal: Proposal;
  evidence: EvidenceBundle;
  failure?: string;
}): string {
  const { outcome, verdict, proposal, evidence, failure } = input;
  const amount = formatCents(proposal.amountCents);
  const vendor = evidence.vendorName;
  const action = proposal.action.toLowerCase().replace(/_/g, " ");

  switch (outcome) {
    case "EXECUTED":
      return `Charged ${amount} for ${vendor} (${action}).`;
    case "ESCALATED":
      return `Escalated ${vendor}. ${reasonFor(verdict)} Nothing was charged.`;
    case "REFUSED":
      return `Refused ${amount} for ${vendor}. ${failure ?? reasonFor(verdict)} Nothing was charged.`;
    case "FAILED":
      return `Could not complete ${amount} for ${vendor}. ${failure ?? ""} Nothing was charged.`.replace(
        /\s+/g,
        " ",
      );
    default:
      return `${vendor}: ${outcome.toLowerCase()}.`;
  }
}

/**
 * The counterfactual — the most persuasive single line available.
 *
 * "Do nothing and you pay X on Y" gives every decision stakes and makes
 * inaction expensive, which is the whole point of an agent that acts.
 */
export function counterfactualLine(evidence: EvidenceBundle): string {
  return `Do nothing and you pay ${formatCents(evidence.renewal.amountCents)} on ${evidence.renewal.dueDate}.`;
}

export function refusalCodeFor(verdict: Verdict): RefusalCode {
  switch (verdict.code) {
    case "MALFORMED_PROPOSAL":
      return "MALFORMED_PROPOSAL";
    case "UNSUPPORTED_CURRENCY":
      return "UNSUPPORTED_CURRENCY";
    case "NO_MANDATE":
      return "OUTSIDE_AUTHORITY";
    case "MANDATE_NOT_CHARGEABLE":
      return "MANDATE_INACTIVE";
    default:
      return "POLICY_DENIED";
  }
}

// ---------------------------------------------------------------------------
// Read-side — derived on every render, never stored
// ---------------------------------------------------------------------------

/** Three evidence chips. More than three and judges stop reading. */
export function evidenceChips(entry: LedgerEntry): string[] {
  const { evidence } = entry;
  const chips: string[] = [];

  if (evidence.seats.activeTrailing30d === null) {
    chips.push("usage unknown");
  } else {
    chips.push(
      `${evidence.seats.activeTrailing30d}/${evidence.seats.assigned} seats active`,
    );
  }

  chips.push(`renews in ${evidence.renewal.daysUntilDue}d`);

  const history = evidence.priceHistory;
  const previous = history.length > 0 ? history[history.length - 1] : null;
  if (previous && previous.amountCents !== evidence.renewal.amountCents) {
    const delta = Math.round(
      ((evidence.renewal.amountCents - previous.amountCents) /
        previous.amountCents) *
        100,
    );
    chips.push(`${delta > 0 ? "+" : ""}${delta}% vs last cycle`);
  } else {
    chips.push(`${formatCents(evidence.renewal.amountCents)} listed`);
  }

  return chips;
}

/** One line of money. Negative savings are shown honestly, not hidden. */
export function impactLine(entry: LedgerEntry): string {
  const { chargedCents, savedCents } = entry.financialImpact;

  if (entry.outcome !== "EXECUTED") {
    return "Nothing charged.";
  }
  if (savedCents > 0) {
    return `Charged ${formatCents(chargedCents)}, saving ${formatCents(savedCents as never)}.`;
  }
  if (savedCents < 0) {
    return `Charged ${formatCents(chargedCents)}, ${formatCents(Math.abs(savedCents) as never)} more than the prior cycle.`;
  }
  return `Charged ${formatCents(chargedCents)}.`;
}

/** The user's own words, rendered wherever the entry is shown. */
export function citationLine(entry: LedgerEntry): string | null {
  const source = entry.authorizedBy?.sourceFragment;
  if (!source) return null;
  return `Authorized by: "${source}"`;
}

/**
 * Who did what, as four named actors.
 *
 * Rendering the separation of powers is the point: a reader must be able to see
 * at a glance that the thing which decided is not the thing which permitted.
 */
export function attributionLines(entry: LedgerEntry): Array<{
  role: string;
  value: string;
}> {
  const lines: Array<{ role: string; value: string }> = [];

  if (entry.decidedBy) {
    lines.push({
      role: "decided by",
      value: entry.decidedBy.stubbed
        ? `agent (${entry.decidedBy.modelId}, deterministic fallback)`
        : `agent (${entry.decidedBy.modelId}, prompt ${entry.decidedBy.promptVersion})`,
    });
  }

  if (entry.authorizedBy) {
    const human = entry.authorizedBy.approverId;
    lines.push({
      role: "authorized by",
      value: human
        ? `${human}${entry.authorizedBy.passkeyAt ? ` (passkey ${entry.authorizedBy.passkeyAt})` : ""}`
        : `policy v${entry.authorizedBy.policyVersion}, rule ${entry.authorizedBy.ruleOrdinal}`,
    });
  }

  if (entry.executedBy) {
    lines.push({
      role: "executed by",
      value: `${entry.executedBy.provider} · mandate ${entry.executedBy.mandateId}${
        entry.executedBy.chargeId ? ` · charge ${entry.executedBy.chargeId}` : ""
      }`,
    });
  }

  lines.push({ role: "recorded", value: entry.id });

  return lines;
}
