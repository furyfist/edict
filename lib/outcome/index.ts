import { prisma } from "../db/client";
import { plusHours } from "../clock";
import {
  AGENT,
  ENGINE,
  NETWORK,
  NOBODY,
  TICK,
  appendEntry,
  captureIntent,
  closeIntent,
  DuplicateEntryError,
} from "../ledger";
import { getPravaAdapter, isRetryable } from "../prava";
import type { ChargeResult, PravaAdapter } from "../prava";
import type {
  EvidenceBundle,
  LedgerOutcome,
  Proposal,
  Verdict,
} from "../contracts";

/**
 * The outcome router.
 *
 * It turns a verdict into one of three things: a charge, an approval request,
 * or a refusal. All the branching lives here, which is what lets the engine
 * stay a pure function — every "if the decision was X, then do Y" in the system
 * is in this file rather than smuggled into the evaluator.
 *
 * This is also the only caller of the payment adapter. Exactly one module can
 * move money and exactly one module asks it to.
 */

/** Consent is to act on specific evidence, and evidence ages. */
export const APPROVAL_TTL_HOURS = 24;

export interface RouteInput {
  tickId: string;
  recordedAt: Date;
  bundle: EvidenceBundle;
  proposal: Proposal | null;
  verdict: Verdict;
  /** The mandate this vendor's charges run against, when one exists. */
  mandateId: string | null;
  adapter?: PravaAdapter;
}

export interface RouteResult {
  entryId: string | null;
  outcome: LedgerOutcome;
  /** True when the entry already existed for this renewal and cycle. */
  duplicate: boolean;
}

export async function route(input: RouteInput): Promise<RouteResult> {
  switch (input.verdict.decision) {
    case "ALLOW_AUTO":
      return executeCharge(input);
    case "REQUIRE_APPROVAL":
      return raiseApproval(input);
    case "DENY":
      return recordRefusal(input, "REFUSED");
    default:
      // Unreachable given the contract, and if it were reachable the safe
      // reading of an unrecognized decision is a refusal, not a charge.
      return recordRefusal(input, "REFUSED");
  }
}

/** Shared attribution. Four actors, named separately, on every entry. */
function attribution(input: RouteInput) {
  return {
    tickId: input.tickId,
    recordedAt: input.recordedAt,
    vendorId: input.bundle.vendor.id,
    renewalId: input.bundle.renewal.id,
    cycleKey: input.bundle.renewal.cycleKey,
    decidedBy: AGENT,
    authorizedBy: ENGINE,
    recordedBy: TICK,
    decision: input.verdict.decision,
    reason: input.verdict.reason,
    citedRuleId: input.verdict.citedRuleId,
    citedSourceFragment: input.verdict.citedSourceFragment,
    policyVersionId: input.verdict.policyVersionId,
    agentRationale: input.proposal ? input.proposal.rationale : null,
    agentRejectedAlternative: input.proposal
      ? input.proposal.rejectedAlternative
      : null,
  };
}

/**
 * The engine permitted this. Money moves — through the one boundary, with the
 * intention captured before the call and the answer appended after it.
 */
async function executeCharge(input: RouteInput): Promise<RouteResult> {
  const { verdict, bundle } = input;
  const amount = verdict.permittedAmount;

  // An ALLOW_AUTO on an action that moves no money is recorded as executed
  // without touching the adapter.
  if (!amount) {
    return recordRefusal(input, "EXECUTED", NOBODY);
  }

  if (!input.mandateId) {
    // Permission without a credential to spend under. Nothing is charged, and
    // the reason is recorded rather than being logged and swallowed.
    return recordRefusal(input, "REFUSED", NOBODY, {
      note: "The policy permitted this charge but no mandate exists for the vendor.",
    });
  }

  const adapter = input.adapter ?? getPravaAdapter();
  const idempotencyKey = `${bundle.renewal.id}:${bundle.renewal.cycleKey}`;

  // ---- capture before charge ----
  let entryId: string;
  try {
    entryId = await captureIntent({
      ...attribution(input),
      amount,
      executedBy: NETWORK,
      pravaMandateId: input.mandateId,
      detail: { idempotencyKey, adapterMode: adapter.mode },
    });
  } catch (error) {
    if (error instanceof DuplicateEntryError) {
      return { entryId: null, outcome: "EXECUTED", duplicate: true };
    }
    throw error;
  }

  // ---- charge ----
  let result = await adapter.charge({
    mandateId: input.mandateId,
    amountCents: amount.cents,
    currency: amount.currency,
    idempotencyKey,
    description: `${bundle.vendor.name} ${bundle.renewal.cycleKey}`,
  });

  // A decline is an answer and is never retried. The absence of an answer —
  // a timeout, an unreachable host — retries exactly once.
  if (!result.ok && isRetryable(result)) {
    result = await adapter.charge({
      mandateId: input.mandateId,
      amountCents: amount.cents,
      currency: amount.currency,
      idempotencyKey,
      description: `${bundle.vendor.name} ${bundle.renewal.cycleKey}`,
    });
  }

  await closeIntent({
    entryId,
    outcome: outcomeFor(result),
    pravaChargeId: result.ok ? result.chargeId : result.chargeId,
    pravaSessionId: result.ok ? result.sessionId : result.sessionId,
    detail: result.ok
      ? { chargedCents: result.amountCents }
      : {
          failureKind: result.kind,
          networkMessage: result.networkMessage,
          retried: isRetryable(result),
          note: "Nothing was charged.",
        },
  });

  return { entryId, outcome: outcomeFor(result), duplicate: false };
}

/** The four outcomes a charge attempt can close with. Narrower than LedgerOutcome. */
type ChargeOutcome =
  | "EXECUTED"
  | "APPROVED_AND_EXECUTED"
  | "NETWORK_DECLINE"
  | "ADAPTER_FAILURE";

function outcomeFor(result: ChargeResult): ChargeOutcome {
  if (result.ok) return "EXECUTED";
  switch (result.kind) {
    case "DECLINED":
    case "MANDATE_PAUSED":
    case "MANDATE_EXPIRED":
    case "MANDATE_NOT_FOUND":
      return "NETWORK_DECLINE";
    default:
      return "ADAPTER_FAILURE";
  }
}

/**
 * The engine wants a human. An approval request is raised carrying a frozen
 * snapshot of the evidence and verdict it was raised on, and the ledger records
 * the escalation immediately — a pending decision is a thing that happened.
 */
async function raiseApproval(input: RouteInput): Promise<RouteResult> {
  const { bundle, verdict } = input;

  const existing = await prisma.approvalRequest.findFirst({
    where: {
      renewalId: bundle.renewal.id,
      cycleKey: bundle.renewal.cycleKey,
    },
    select: { id: true },
  });

  if (!existing) {
    await prisma.approvalRequest.create({
      data: {
        renewalId: bundle.renewal.id,
        cycleKey: bundle.renewal.cycleKey,
        vendorId: bundle.vendor.id,
        // In-app approval permits a charge within existing authority. Raising a
        // ceiling is a different kind, decided in M3 at the point of approval.
        kind: "POLICY_EXCEPTION",
        amountCents: bundle.renewal.amount.cents,
        currency: bundle.renewal.amount.currency,
        evidenceSnapshot: JSON.parse(JSON.stringify(bundle)),
        verdictSnapshot: JSON.parse(JSON.stringify(verdict)),
        requestedAt: input.recordedAt,
        expiresAt: plusHours(input.recordedAt, APPROVAL_TTL_HOURS),
      },
    });
  }

  return recordRefusal(input, "ESCALATED", NOBODY, {
    approvalExpiresInHours: APPROVAL_TTL_HOURS,
  });
}

/**
 * Nothing moved. Every path through this function ends with a visible ledger
 * entry — a refusal that is not written down is indistinguishable from a
 * failure to notice.
 */
async function recordRefusal(
  input: RouteInput,
  outcome: LedgerOutcome,
  executedBy = NOBODY,
  detail: Record<string, unknown> = {},
): Promise<RouteResult> {
  try {
    const entryId = await appendEntry({
      ...attribution(input),
      outcome,
      amount:
        outcome === "EXECUTED"
          ? input.verdict.permittedAmount
          : input.bundle.renewal.amount,
      executedBy,
      detail: {
        ...detail,
        ...(outcome === "EXECUTED" ? {} : { note: "Nothing was charged." }),
        counterfactual: input.verdict.counterfactual ?? null,
        evidenceGaps: input.verdict.evidenceGaps,
      },
    });
    return { entryId, outcome, duplicate: false };
  } catch (error) {
    if (error instanceof DuplicateEntryError) {
      return { entryId: null, outcome, duplicate: true };
    }
    throw error;
  }
}
