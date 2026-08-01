import { prisma } from "../db/client";
import { now, plusHours } from "../clock";
import {
  AGENT,
  ENGINE,
  NETWORK,
  NOBODY,
  appendEntry,
  captureIntent,
  closeIntent,
  human,
} from "../ledger";
import { getPravaAdapter, isRetryable } from "../prava";
import type { PravaAdapter } from "../prava";
import type { EvidenceBundle, Verdict } from "../contracts";

/**
 * The two approval paths.
 *
 * They are two paths and not one, and the distinction is the whole trust
 * argument:
 *
 *   A **policy exception** permits one charge that the policy would have
 *   escalated, against authority that already exists. The human is saying
 *   "yes, this particular charge, within the ceiling you already hold."
 *   Nothing about the agent's authority changes.
 *
 *   A **ceiling raise** is a request for *more authority than exists*. It
 *   cannot be granted in this application at all, because the authority does
 *   not live here — it lives in a mandate Prava holds, and raising it requires
 *   a fresh passkey ceremony that mints a new one. There is no code path in
 *   this file that increases a ceiling, and that absence is the point.
 *
 * Collapsing these into one "approve" button would make the second look like
 * the first, and the claim that the application cannot grant itself authority
 * would become a claim about discipline rather than about structure.
 *
 * Consent is also time-bounded. An approval is consent to act on specific
 * evidence, and evidence ages: a snapshot is frozen when the approval is
 * raised, it expires 24 hours later, and an expired approval is never revived.
 */

export const APPROVAL_TTL_HOURS = 24;

export type ApprovalOutcome =
  | { ok: true; entryId: string | null; charged: boolean; detail: string }
  | { ok: false; reason: string };

interface LoadedApproval {
  id: string;
  renewalId: string;
  cycleKey: string;
  vendorId: string;
  kind: "POLICY_EXCEPTION" | "CEILING_RAISE";
  status: string;
  amountCents: number;
  currency: string;
  expiresAt: Date;
  evidence: EvidenceBundle;
  verdict: Verdict;
}

async function load(approvalId: string): Promise<LoadedApproval | null> {
  const row = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
  });
  if (!row) return null;
  return {
    id: row.id,
    renewalId: row.renewalId,
    cycleKey: row.cycleKey,
    vendorId: row.vendorId,
    kind: row.kind,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
    expiresAt: row.expiresAt,
    evidence: row.evidenceSnapshot as unknown as EvidenceBundle,
    verdict: row.verdictSnapshot as unknown as Verdict,
  };
}

/**
 * Whether this approval can still be acted on.
 *
 * Expiry is checked against the demo clock at the moment of action, not by a
 * background job. A sweeper that marks approvals expired can lag; a check at
 * the point of use cannot, and the point of use is the only place where being
 * wrong would matter.
 */
async function checkActionable(
  approval: LoadedApproval,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (approval.status !== "PENDING") {
    return {
      ok: false,
      reason: `This approval is already ${approval.status.toLowerCase()} and cannot be acted on again.`,
    };
  }

  const instant = await now();
  if (instant >= approval.expiresAt) {
    // Mark it expired so the UI reflects reality, then refuse. An expired
    // approval is never revived — the evidence it was granted against is now
    // old enough that the human's consent no longer covers the situation.
    await prisma.approvalRequest.update({
      where: { id: approval.id },
      data: { status: "EXPIRED", resolvedAt: instant },
    });
    await appendEntry({
      recordedAt: instant,
      tickId: `approval_${approval.id}`,
      vendorId: approval.vendorId,
      renewalId: null,
      cycleKey: null,
      outcome: "EXPIRED",
      amount: { cents: approval.amountCents, currency: "USD" },
      decidedBy: AGENT,
      authorizedBy: NOBODY,
      executedBy: NOBODY,
      detail: {
        approvalId: approval.id,
        note: "Nothing was charged. The approval expired before it was acted on.",
        expiredAt: approval.expiresAt.toISOString(),
      },
    });
    return {
      ok: false,
      reason:
        "This approval expired. Consent was given for evidence that is now stale; raise it again on current evidence.",
    };
  }

  return { ok: true };
}

/**
 * Approve a policy exception.
 *
 * Permits exactly one charge, within authority the mandate already holds. It
 * grants nothing further: the approval is marked CONSUMED, the mandate's
 * ceiling is untouched, and the next renewal for this vendor is adjudicated
 * from scratch under the same policy as before.
 *
 * If the amount exceeds the mandate's remaining authority, this refuses and
 * says so. It does not quietly become a ceiling raise.
 */
export async function approvePolicyException(
  approvalId: string,
  approvedBy: string,
  adapter: PravaAdapter = getPravaAdapter(),
): Promise<ApprovalOutcome> {
  const approval = await load(approvalId);
  if (!approval) return { ok: false, reason: "No such approval." };

  if (approval.kind !== "POLICY_EXCEPTION") {
    return {
      ok: false,
      reason:
        "This request needs a ceiling raise, which requires a passkey ceremony. It cannot be approved in-app.",
    };
  }

  const actionable = await checkActionable(approval);
  if (!actionable.ok) return { ok: false, reason: actionable.reason };

  const mandate = await prisma.mandate.findFirst({
    where: { vendorId: approval.vendorId, status: "ACTIVE" },
    orderBy: { pravaMandateId: "asc" },
  });

  if (!mandate) {
    return {
      ok: false,
      reason: "No active mandate exists for this vendor. Nothing can be charged.",
    };
  }

  // The load-bearing check. In-app approval spends existing authority; it
  // never creates any. An amount above what the mandate holds is refused here,
  // and would be refused by the network even if it were not.
  const remaining = mandate.amountCeilingCents - mandate.spentCents;
  if (approval.amountCents > remaining) {
    return {
      ok: false,
      reason:
        `This charge is above the remaining authority on the mandate. ` +
        `An in-app approval cannot raise a ceiling — that needs a passkey ceremony.`,
    };
  }

  const instant = await now();
  const approver = human(approvedBy, approvedBy);
  const idempotencyKey = `${approval.renewalId}:${approval.cycleKey}:approved`;

  const entryId = await captureIntent({
    recordedAt: instant,
    tickId: `approval_${approval.id}`,
    vendorId: approval.vendorId,
    renewalId: null,
    cycleKey: null,
    amount: { cents: approval.amountCents, currency: "USD" },
    // The four actors, and the one that changed: a human authorized this,
    // not the engine. The ledger shows exactly who.
    decidedBy: AGENT,
    authorizedBy: approver,
    executedBy: NETWORK,
    decision: approval.verdict.decision,
    reason: approval.verdict.reason,
    citedRuleId: approval.verdict.citedRuleId,
    citedSourceFragment: approval.verdict.citedSourceFragment,
    policyVersionId: approval.verdict.policyVersionId,
    pravaMandateId: mandate.pravaMandateId,
    detail: { approvalId: approval.id, approvalKind: "POLICY_EXCEPTION" },
  });

  let result = await adapter.charge({
    mandateId: mandate.pravaMandateId,
    amountCents: approval.amountCents,
    currency: "USD",
    idempotencyKey,
    description: `${approval.vendorId} ${approval.cycleKey} (approved)`,
  });

  if (!result.ok && isRetryable(result)) {
    result = await adapter.charge({
      mandateId: mandate.pravaMandateId,
      amountCents: approval.amountCents,
      currency: "USD",
      idempotencyKey,
      description: `${approval.vendorId} ${approval.cycleKey} (approved)`,
    });
  }

  await closeIntent({
    entryId,
    outcome: result.ok
      ? "APPROVED_AND_EXECUTED"
      : result.kind === "DECLINED" ||
          result.kind === "MANDATE_PAUSED" ||
          result.kind === "MANDATE_EXPIRED" ||
          result.kind === "MANDATE_NOT_FOUND"
        ? "NETWORK_DECLINE"
        : "ADAPTER_FAILURE",
    pravaChargeId: result.ok ? result.chargeId : result.chargeId,
    pravaSessionId: result.ok ? result.sessionId : result.sessionId,
    detail: result.ok
      ? { chargedCents: result.amountCents }
      : {
          failureKind: result.kind,
          networkMessage: result.networkMessage,
          note: "Nothing was charged.",
        },
  });

  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { status: "CONSUMED", resolvedAt: instant, resolvedBy: approvedBy },
  });

  return {
    ok: true,
    entryId,
    charged: result.ok,
    detail: result.ok
      ? "Charged once against the existing mandate. No further authority was granted."
      : `Nothing was charged: ${result.networkMessage}`,
  };
}

/**
 * Reject an approval.
 *
 * Writes a refusal and closes the action for this cycle. The agent does not
 * get to propose the same thing again next tick — a human said no, and the
 * ledger records that as the reason nothing happened.
 */
export async function rejectApproval(
  approvalId: string,
  rejectedBy: string,
  note?: string,
): Promise<ApprovalOutcome> {
  const approval = await load(approvalId);
  if (!approval) return { ok: false, reason: "No such approval." };

  const actionable = await checkActionable(approval);
  if (!actionable.ok) return { ok: false, reason: actionable.reason };

  const instant = await now();
  const rejecter = human(rejectedBy, rejectedBy);

  const entryId = await appendEntry({
    recordedAt: instant,
    tickId: `approval_${approval.id}`,
    vendorId: approval.vendorId,
    renewalId: null,
    cycleKey: null,
    outcome: "REJECTED_BY_HUMAN",
    amount: { cents: approval.amountCents, currency: "USD" },
    decidedBy: AGENT,
    authorizedBy: rejecter,
    executedBy: NOBODY,
    decision: approval.verdict.decision,
    reason: approval.verdict.reason,
    citedRuleId: approval.verdict.citedRuleId,
    citedSourceFragment: approval.verdict.citedSourceFragment,
    policyVersionId: approval.verdict.policyVersionId,
    detail: {
      approvalId: approval.id,
      note: "Nothing was charged.",
      rejectionNote: note ?? null,
    },
  });

  await prisma.approvalRequest.update({
    where: { id: approval.id },
    data: { status: "REJECTED", resolvedAt: instant, resolvedBy: rejectedBy },
  });

  return {
    ok: true,
    entryId,
    charged: false,
    detail: "Rejected. This action is closed for the cycle.",
  };
}

/** Pending approvals, with the frozen snapshot each was raised against. */
export async function listPendingApprovals() {
  const instant = await now();
  const rows = await prisma.approvalRequest.findMany({
    where: { status: "PENDING" },
    orderBy: { requestedAt: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    vendorId: row.vendorId,
    renewalId: row.renewalId,
    cycleKey: row.cycleKey,
    kind: row.kind,
    amountCents: row.amountCents,
    requestedAt: row.requestedAt,
    expiresAt: row.expiresAt,
    // Computed against the demo clock at read time, so a page never shows a
    // live "approve" button on something that can no longer be approved.
    expired: instant >= row.expiresAt,
    hoursRemaining: Math.max(
      0,
      Math.floor((row.expiresAt.getTime() - instant.getTime()) / 3_600_000),
    ),
    evidence: row.evidenceSnapshot as unknown as EvidenceBundle,
    verdict: row.verdictSnapshot as unknown as Verdict,
  }));
}

export async function listHistoricalApprovals(limit = 50) {
  const rows = await prisma.approvalRequest.findMany({
    where: { status: { not: "PENDING" } },
    orderBy: { resolvedAt: "desc" },
    take: limit,
  });
  return rows;
}

export { plusHours };
