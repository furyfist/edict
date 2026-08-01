import { prisma } from "../db/client";
import { now, plusDays } from "../clock";
import { AGENT, NETWORK, NOBODY, appendEntry, human } from "../ledger";
import { getPravaAdapter } from "../prava";
import type { PravaAdapter } from "../prava";
import type { EvidenceBundle, Verdict } from "../contracts";

/**
 * The ceiling raise.
 *
 * This is the path for a charge that exceeds the authority the agent holds.
 * The thing to notice is what it does *not* do: it never updates
 * `amountCeilingCents` on an existing mandate row. There is no line in this
 * file that raises a ceiling, and there is no line anywhere else either.
 *
 * Instead it asks Prava to mint a *new* mandate, and Prava will only do that
 * after a passkey ceremony — a human present at a device, proving they are
 * there, at the moment authority is created. The signed credential that comes
 * back is the authority. Our database only ever mirrors it.
 *
 * This is why the two approval paths are separate. If an operator could raise
 * a ceiling by clicking approve, then the amount limit would be enforced by
 * our application, and "the agent cannot exceed its authority" would be a
 * statement about our code being correct. As it stands, the limit is enforced
 * in a tokenized credential we cannot modify, and our code being wrong does
 * not change it.
 *
 * There is no override. Not an admin flag, not an environment variable, not a
 * `force` parameter. If the ceremony does not complete, the charge does not
 * happen.
 */

export interface CeilingRaiseRequest {
  approvalId: string;
  requestedCeilingCents: number;
  /**
   * Proof that a passkey ceremony completed, issued by Prava. This is not
   * something the application can produce — it comes back from the ceremony
   * and is handed to Prava, which verifies it independently.
   */
  passkeyCeremonyId: string;
  requestedBy: string;
}

export type CeilingRaiseResult =
  | {
      ok: true;
      mandateId: string;
      authorizedCents: number;
      entryId: string;
      detail: string;
    }
  | { ok: false; reason: string };

export async function raiseCeiling(
  request: CeilingRaiseRequest,
  adapter: PravaAdapter = getPravaAdapter(),
): Promise<CeilingRaiseResult> {
  const row = await prisma.approvalRequest.findUnique({
    where: { id: request.approvalId },
  });

  if (!row) return { ok: false, reason: "No such approval." };

  if (row.status !== "PENDING") {
    return {
      ok: false,
      reason: `This approval is already ${row.status.toLowerCase()}.`,
    };
  }

  // A ceremony id is mandatory and is never defaulted, generated, or made
  // optional "for testing". An empty one is the shape a bypass would take.
  if (!request.passkeyCeremonyId.trim()) {
    return {
      ok: false,
      reason:
        "A completed passkey ceremony is required. Authority cannot be granted from within this application.",
    };
  }

  const instant = await now();
  if (instant >= row.expiresAt) {
    await prisma.approvalRequest.update({
      where: { id: row.id },
      data: { status: "EXPIRED", resolvedAt: instant },
    });
    return {
      ok: false,
      reason: "This approval expired. Raise it again on current evidence.",
    };
  }

  if (
    !Number.isInteger(request.requestedCeilingCents) ||
    request.requestedCeilingCents <= 0
  ) {
    return { ok: false, reason: "The requested ceiling is not a valid amount." };
  }

  const verdict = row.verdictSnapshot as unknown as Verdict;
  const evidence = row.evidenceSnapshot as unknown as EvidenceBundle;

  // Mint a new mandate. Prava verifies the ceremony; if it does not check out,
  // this fails and no authority is created.
  const created = await adapter.createMandate({
    vendorId: row.vendorId,
    merchantId: evidence.vendor.merchantId,
    amountCeilingCents: request.requestedCeilingCents,
    currency: "USD",
    expiresAt: plusDays(instant, 90).toISOString(),
    passkeyCeremonyId: request.passkeyCeremonyId,
  });

  if (!created.ok || !created.mandate) {
    return {
      ok: false,
      reason:
        created.error ??
        "The payment network did not issue a mandate. No authority was granted.",
    };
  }

  const approver = human(request.requestedBy, request.requestedBy);

  // The new authority is recorded as its own ledger entry. Creating authority
  // is an event in its own right — separate from any charge made under it —
  // and it belongs in the record whether or not a charge follows.
  const entryId = await appendEntry({
    recordedAt: instant,
    tickId: `ceiling_${row.id}`,
    vendorId: row.vendorId,
    renewalId: null,
    cycleKey: null,
    outcome: "ESCALATED",
    amount: { cents: request.requestedCeilingCents, currency: "USD" },
    decidedBy: AGENT,
    // A human authorized this, at a device, with a passkey. Not the engine.
    authorizedBy: approver,
    executedBy: NETWORK,
    decision: verdict.decision,
    reason: verdict.reason,
    citedRuleId: verdict.citedRuleId,
    citedSourceFragment: verdict.citedSourceFragment,
    policyVersionId: verdict.policyVersionId,
    pravaMandateId: created.mandate.mandateId,
    detail: {
      approvalId: row.id,
      approvalKind: "CEILING_RAISE",
      passkeyCeremonyId: request.passkeyCeremonyId,
      priorCeilingCents: null,
      newCeilingCents: created.mandate.amountCeilingCents,
      note:
        "A new mandate was minted after a passkey ceremony. No existing " +
        "ceiling was modified — this application cannot modify one.",
    },
  });

  await prisma.approvalRequest.update({
    where: { id: row.id },
    data: {
      status: "APPROVED",
      resolvedAt: instant,
      resolvedBy: request.requestedBy,
      grantedMandateId: created.mandate.mandateId,
    },
  });

  return {
    ok: true,
    mandateId: created.mandate.mandateId,
    authorizedCents: created.mandate.amountCeilingCents,
    entryId,
    detail:
      "A new mandate was issued after the passkey ceremony. The previous mandate is unchanged.",
  };
}

/**
 * Whether a pending approval needs a ceremony rather than a click.
 *
 * The UI calls this to decide which button to show. Showing the in-app
 * approve button on something that needs a ceremony is how the distinction
 * gets quietly lost.
 */
export async function requiresPasskeyCeremony(
  approvalId: string,
): Promise<boolean> {
  const row = await prisma.approvalRequest.findUnique({
    where: { id: approvalId },
    select: { kind: true, vendorId: true, amountCents: true },
  });
  if (!row) return false;
  if (row.kind === "CEILING_RAISE") return true;

  const mandate = await prisma.mandate.findFirst({
    where: { vendorId: row.vendorId, status: "ACTIVE" },
    orderBy: { pravaMandateId: "asc" },
  });
  if (!mandate) return false;

  return row.amountCents > mandate.amountCeilingCents - mandate.spentCents;
}
