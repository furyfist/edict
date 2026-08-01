import { cents } from "../contracts/money";
import { isAction } from "../contracts";
import { evaluate } from "../policy/engine";
import {
  counterfactualLine,
  explainOutcome,
  refusalCodeFor,
} from "../explain";
import type {
  Action,
  AuthorizedBy,
  Cents,
  DecidedBy,
  EvidenceBundle,
  Outcome,
  Policy,
  Proposal,
  RefusalCode,
  Verdict,
} from "../contracts";
import { appendEntry as defaultAppendEntry } from "../ledger";
import type { LedgerCompletion, LedgerDraft } from "../ledger";
import { paymentBoundary } from "../prava";
import type { PaymentBoundary } from "../prava";
import { raiseApproval as defaultRaiseApproval } from "./approvals";

/**
 * The outcome router: turns a verdict into an effect.
 *
 * Branching lives here rather than in the engine so the engine stays a pure
 * function. This module is where the three paths diverge — charge, escalate,
 * refuse — and where the capture-before-charge ordering is enforced.
 *
 * Dependencies are injected so the whole thing can be exercised against an
 * in-memory adapter and a fake ledger, with no database.
 */

export interface RouteInput {
  tickId: string;
  clock: Date;
  proposal: Proposal;
  evidence: EvidenceBundle;
  policy: Policy;
  decidedBy: DecidedBy;
}

export interface RouterDeps {
  boundary: PaymentBoundary;
  appendEntry: (draft: LedgerDraft, completion: LedgerCompletion) => Promise<string>;
  raiseApproval: (input: {
    clock: Date;
    proposal: Proposal;
    evidence: EvidenceBundle;
    policy: Policy;
    verdict: Verdict;
  }) => Promise<string>;
}

export interface RouteResult {
  entryId: string;
  outcome: Outcome;
  verdict: Verdict;
  approvalId?: string;
}

export function defaultDeps(): RouterDeps {
  return {
    boundary: paymentBoundary(),
    appendEntry: defaultAppendEntry,
    raiseApproval: defaultRaiseApproval,
  };
}

/**
 * Explanations come from `lib/explain` — deterministic templates, no model.
 *
 * They are rendered here, at write time, and stored on the entry so the record
 * shows what was said then. The same module supplies the read-side derived
 * lines, which keeps one vocabulary across write and display.
 */
function explain(
  outcome: Outcome,
  verdict: Verdict,
  proposal: Proposal,
  evidence: EvidenceBundle,
  failure?: string,
): string {
  return explainOutcome({ outcome, verdict, proposal, evidence, failure });
}

export async function routeOutcome(
  input: RouteInput,
  deps: RouterDeps = defaultDeps(),
): Promise<RouteResult> {
  const { proposal, evidence, policy } = input;

  const verdict = evaluate({ proposal, evidence, policy });

  const authorizedBy: AuthorizedBy = {
    policyVersionId: policy.id,
    policyVersion: policy.version,
    ruleId: verdict.matchedRuleId,
    ruleOrdinal: verdict.matchedRuleOrdinal,
    sourceFragment: verdict.matchedSourceFragment,
    approverId: null,
    approvalId: null,
    passkeyAt: null,
  };

  /**
   * The proposed action, coerced into the closed set before it reaches storage.
   *
   * ---------------------------------------------------------------------------
   * FOUND BY THE GAUNTLET, ON ITS FIRST FULL RUN.
   *
   * `proposedAction` is a database enum. An attacker who owns the proposer can
   * emit an action outside that enum — `TRANSFER_FUNDS` is in the corpus — and
   * the engine correctly refuses it as MALFORMED_PROPOSAL. But the WRITE of that
   * refusal then threw, and the whole tick died with it.
   *
   * So the refusal was right and unrecordable, which is the worst combination
   * available: an attacker could not move money, but could reliably stop the
   * agent from working and leave nothing in the record explaining why.
   *
   * The raw value is not lost — it is already inside the frozen evidence and the
   * verdict detail, and ESCALATE is the same sentinel the runner uses when the
   * agent's output fails its contract upstream.
   * ---------------------------------------------------------------------------
   */
  const recordedAction: Action = isAction(proposal.action)
    ? proposal.action
    : "ESCALATE";

  // CAPTURE BEFORE CHARGE. Everything needed to reconstruct the record exists
  // before any money is touched. Do not move this below the charge.
  const draft: LedgerDraft = {
    tickId: input.tickId,
    clockAt: input.clock,
    vendorId: evidence.vendorId,
    vendorName: evidence.vendorName,
    renewalId: evidence.renewalId,
    cycleStart: new Date(`${evidence.cycleStart}T00:00:00.000Z`),
    proposedAction: recordedAction,
    proposedAmountCents: proposal.amountCents,
    decidedBy: input.decidedBy,
    authorizedBy,
    evidence,
    alternative: proposal.alternative,
    agentRationale: proposal.rationale,
    counterfactualCents: evidence.renewal.amountCents,
  };

  const counterfactual = counterfactualLine(evidence);
  const zero = cents(0);

  // -- DENY -----------------------------------------------------------------
  if (verdict.effect === "DENY") {
    const entryId = await deps.appendEntry(draft, {
      outcome: "REFUSED",
      refusalCode: refusalCodeFor(verdict),
      chargedCents: zero,
      explanation: explain("REFUSED", verdict, proposal, evidence),
      counterfactual,
    });
    return { entryId, outcome: "REFUSED", verdict };
  }

  // -- REQUIRE_APPROVAL -----------------------------------------------------
  // Raise the request first, so the ledger entry can name it. Which of the two
  // approval types this is depends on WHY the engine escalated: over the
  // mandate ceiling means only a passkey can help.
  if (verdict.effect === "REQUIRE_APPROVAL") {
    const approvalId = await deps.raiseApproval({
      clock: input.clock,
      proposal,
      evidence,
      policy,
      verdict,
    });

    const entryId = await deps.appendEntry(
      {
        ...draft,
        authorizedBy: { ...authorizedBy, approvalId },
      },
      {
        outcome: "ESCALATED",
        chargedCents: zero,
        explanation: explain("ESCALATED", verdict, proposal, evidence),
        counterfactual,
      },
    );
    return { entryId, outcome: "ESCALATED", verdict, approvalId };
  }

  // -- ALLOW_AUTO -----------------------------------------------------------
  const mandateId = evidence.mandate.mandateId;
  if (!mandateId) {
    const entryId = await deps.appendEntry(draft, {
      outcome: "REFUSED",
      refusalCode: "OUTSIDE_AUTHORITY",
      chargedCents: zero,
      explanation: explain("REFUSED", verdict, proposal, evidence),
      counterfactual,
    });
    return { entryId, outcome: "REFUSED", verdict };
  }

  const request = {
    mandateId,
    amountCents: proposal.amountCents,
    currency: "USD" as const,
    idempotencyKey: `${evidence.renewalId}:${evidence.cycleStart}`,
  };

  let result = await deps.boundary.charge(request);

  // Exactly one retry, and only for transient failures. Declines are never
  // retried — that is how a demo charges twice.
  if (!result.ok && result.failure.retryable) {
    result = await deps.boundary.charge(request);
  }

  if (result.ok) {
    const entryId = await deps.appendEntry(draft, {
      outcome: "EXECUTED",
      chargedCents: proposal.amountCents,
      executedBy: {
        provider: "prava",
        mandateId: result.mandateId,
        chargeId: result.chargeId,
        status: result.status,
      },
      explanation: explain("EXECUTED", verdict, proposal, evidence),
      counterfactual,
    });
    return { entryId, outcome: "EXECUTED", verdict };
  }

  const declined =
    result.failure.kind === "DECLINED_OVER_CAP" ||
    result.failure.kind === "MANDATE_INACTIVE" ||
    result.failure.kind === "MANDATE_NOT_FOUND";

  const outcome: Outcome = declined ? "REFUSED" : "FAILED";
  const refusalCode: RefusalCode | null = declined
    ? result.failure.kind === "DECLINED_OVER_CAP"
      ? "NETWORK_DECLINE"
      : "MANDATE_INACTIVE"
    : null;

  const entryId = await deps.appendEntry(draft, {
    outcome,
    refusalCode,
    chargedCents: zero,
    executedBy: {
      provider: "prava",
      mandateId: result.mandateId,
      chargeId: null,
      status: result.failure.code,
    },
    explanation: explain(outcome, verdict, proposal, evidence, result.failure.message),
    counterfactual,
    error: { code: result.failure.code, message: result.failure.message },
  });

  return { entryId, outcome, verdict };
}

export type { LedgerDraft, LedgerCompletion } from "../ledger";
