import type { Prisma } from "@prisma/client";
import { db } from "../db/client";
import { addDays } from "../clock";
import type {
  ApprovalType,
  Cents,
  EvidenceBundle,
  Policy,
  Proposal,
  Verdict,
} from "../contracts";

/**
 * Approval requests — where human and agent meet.
 *
 * ---------------------------------------------------------------------------
 * TWO TYPES, NEVER INTERCHANGEABLE
 *
 * POLICY_EXCEPTION — the amount is within existing mandate authority, but
 *                    policy wanted a human to look. Approved in-app. Grants
 *                    permission for ONE charge and nothing further.
 *
 * CEILING_RAISE    — the amount exceeds mandate authority. Approving in this
 *                    application CANNOT grant it. New authority requires a new
 *                    mandate, which requires a passkey ceremony on Prava's
 *                    surface. There is no override path, and adding one would
 *                    contradict the whole architecture.
 *
 * The distinction is the most important correctness detail in the approval
 * system: authority originates in a signed mandate, not in our database.
 * ---------------------------------------------------------------------------
 *
 * An approval freezes the proposal, the evidence, and the policy version it was
 * raised under. Consent is to act on specific evidence, and evidence ages —
 * which is why expired approvals are never revived.
 */

const APPROVAL_TTL_DAYS = 1;

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function approvalTypeFor(verdict: Verdict): ApprovalType {
  return verdict.code === "OVER_MANDATE_CEILING"
    ? "CEILING_RAISE"
    : "POLICY_EXCEPTION";
}

export async function raiseApproval(input: {
  clock: Date;
  proposal: Proposal;
  evidence: EvidenceBundle;
  policy: Policy;
  verdict: Verdict;
}): Promise<string> {
  const approval = await db.approval.create({
    data: {
      type: approvalTypeFor(input.verdict),
      status: "PENDING",
      vendorId: input.evidence.vendorId,
      renewalId: input.evidence.renewalId,
      cycleStart: new Date(`${input.evidence.cycleStart}T00:00:00.000Z`),
      proposalSnapshot: json(input.proposal),
      evidenceSnapshot: json(input.evidence),
      policyVersionId: input.policy.id,
      ruleId: input.verdict.matchedRuleId,
      amountCents: input.proposal.amountCents,
      expiresAt: addDays(input.clock, APPROVAL_TTL_DAYS),
    },
    select: { id: true },
  });

  return approval.id;
}

/**
 * Marks approvals past their window as EXPIRED.
 *
 * Run against the demo clock at the start of each tick. An expired approval is
 * never revived — the next tick raises a fresh one with fresh evidence, which
 * is a new decision rather than a resurrected one.
 */
export async function expireStaleApprovals(clock: Date): Promise<number> {
  const result = await db.approval.updateMany({
    where: { status: "PENDING", expiresAt: { lt: clock } },
    data: { status: "EXPIRED" },
  });
  return result.count;
}

export async function listApprovals(status?: "PENDING") {
  return db.approval.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
  });
}

export async function getApproval(id: string) {
  return db.approval.findUnique({ where: { id } });
}

export type ApprovalDecision =
  | { ok: true; type: ApprovalType; requiresPasskey: boolean }
  | { ok: false; error: string };

/**
 * Approve a request.
 *
 * For CEILING_RAISE this records intent ONLY. It does not raise any ceiling and
 * cannot — `passkeyAt` stays null until the owner completes the ceremony on
 * Prava's surface, and until then the charge remains impossible.
 */
export async function approve(input: {
  id: string;
  approverId: string;
  clock: Date;
}): Promise<ApprovalDecision> {
  const approval = await db.approval.findUnique({ where: { id: input.id } });
  if (!approval) return { ok: false, error: "No such approval." };

  if (approval.status !== "PENDING") {
    return { ok: false, error: `This approval is already ${approval.status.toLowerCase()}.` };
  }
  if (approval.expiresAt < input.clock) {
    await db.approval.update({
      where: { id: input.id },
      data: { status: "EXPIRED" },
    });
    return {
      ok: false,
      error: "This approval expired. The evidence behind it is stale.",
    };
  }

  await db.approval.update({
    where: { id: input.id },
    data: {
      status: "APPROVED",
      approverId: input.approverId,
      approvedAt: input.clock,
    },
  });

  return {
    ok: true,
    type: approval.type,
    requiresPasskey: approval.type === "CEILING_RAISE",
  };
}

/**
 * Record that the owner completed a passkey ceremony for a ceiling raise.
 *
 * The only way `passkeyAt` is ever set. Called after Prava confirms the new
 * mandate, never before, and never from the in-app approval path.
 */
export async function recordPasskey(input: {
  id: string;
  clock: Date;
}): Promise<boolean> {
  const approval = await db.approval.findUnique({ where: { id: input.id } });
  if (!approval || approval.type !== "CEILING_RAISE") return false;

  await db.approval.update({
    where: { id: input.id },
    data: { passkeyAt: input.clock },
  });
  return true;
}

/**
 * Reject a request.
 *
 * Closes this action for this cycle. The agent may propose a DIFFERENT action
 * later if the evidence changes — rejection closes an option, not a vendor.
 */
export async function reject(input: {
  id: string;
  approverId: string;
  clock: Date;
}): Promise<ApprovalDecision> {
  const approval = await db.approval.findUnique({ where: { id: input.id } });
  if (!approval) return { ok: false, error: "No such approval." };
  if (approval.status !== "PENDING") {
    return { ok: false, error: `This approval is already ${approval.status.toLowerCase()}.` };
  }

  await db.approval.update({
    where: { id: input.id },
    data: {
      status: "REJECTED",
      approverId: input.approverId,
      rejectedAt: input.clock,
    },
  });

  return { ok: true, type: approval.type, requiresPasskey: false };
}

export function amountOf(approval: { amountCents: number }): Cents {
  return approval.amountCents as Cents;
}
