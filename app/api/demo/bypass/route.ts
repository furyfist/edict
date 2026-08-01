import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getClock, wallNow } from "@/lib/clock";
import { cents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { buildEvidenceBundle } from "@/lib/evidence";
import { appendEntry } from "@/lib/ledger";
import { paymentBoundary } from "@/lib/prava";

export const dynamic = "force-dynamic";

/**
 * DEMO BEAT 2 — the announced bypass.
 *
 * This endpoint deliberately SKIPS the policy engine and issues a charge
 * straight through the payment boundary. It exists to demonstrate the layer
 * beneath our own code: even with our first gate removed, the ceiling holds,
 * because it is enforced in the tokenized credential rather than here.
 *
 * ---------------------------------------------------------------------------
 * SAY IT OUT LOUD BEFORE YOU CLICK IT.
 *
 * "I am now bypassing our own policy engine to show you the layer underneath."
 *
 * Announcing the bypass is what makes this beat land. Hiding it would turn a
 * genuine demonstration into a trick, and a judge who works out that the engine
 * was skipped without being told will — correctly — stop believing the rest.
 * ---------------------------------------------------------------------------
 *
 * Two modes, because the climax must survive the sandbox behaving unexpectedly:
 *
 *   over_cap — charge above the mandate ceiling. Expected: a Visa decline,
 *              surfaced as THRESHOLD_EXCEEDED.
 *   paused   — pause the mandate first, then charge. Enforcement fully under
 *              our control, and the documented fallback if over_cap does not
 *              decline as the API reference describes.
 */
export async function POST(request: Request) {
  let body: { vendorId?: unknown; amountCents?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.vendorId !== "string") {
    return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
  }

  const mode = body.mode === "paused" ? "paused" : "over_cap";
  const clock = await getClock();

  const mandate = await db.mandate.findUnique({
    where: { vendorId: body.vendorId },
  });
  const vendor = await db.vendor.findUnique({ where: { id: body.vendorId } });
  if (!mandate || !vendor) {
    return NextResponse.json(
      { error: "vendor has no mandate" },
      { status: 404 },
    );
  }

  const renewal = await db.renewal.findFirst({
    where: { vendorId: body.vendorId },
    orderBy: { cycleStart: "desc" },
  });
  if (!renewal) {
    return NextResponse.json({ error: "no renewal" }, { status: 404 });
  }

  const evidence = await buildEvidenceBundle({
    renewalId: renewal.id,
    clock,
  });
  if (!evidence) {
    return NextResponse.json({ error: "no evidence" }, { status: 404 });
  }

  const amountCents =
    typeof body.amountCents === "number" && Number.isInteger(body.amountCents)
      ? cents(body.amountCents)
      : (cents(mandate.capCents * 20) as Cents);

  const boundary = paymentBoundary();

  if (mode === "paused") {
    await boundary.pauseMandate(mandate.pravaMandateId);
    await db.mandate.update({
      where: { vendorId: body.vendorId },
      data: { status: "PAUSED", refreshedAt: wallNow() },
    });
  }

  const tick = await db.tick.create({
    data: { clockAt: clock, status: "COMPLETED", finishedAt: wallNow() },
  });

  const result = await boundary.charge({
    mandateId: mandate.pravaMandateId,
    amountCents: mode === "paused" ? (cents(renewal.amountCents) as Cents) : amountCents,
    currency: "USD",
    idempotencyKey: `bypass:${renewal.id}:${wallNow().getTime()}`,
  });

  const attempted =
    mode === "paused" ? cents(renewal.amountCents) : amountCents;

  // Recorded like any other outcome. A bypass that left no trace would be
  // exactly the kind of invisible money movement this ledger exists to prevent.
  const entryId = await appendEntry(
    {
      tickId: tick.id,
      clockAt: clock,
      vendorId: vendor.id,
      vendorName: vendor.name,
      renewalId: renewal.id,
      cycleStart: renewal.cycleStart,
      proposedAction: "RENEW_AS_IS",
      proposedAmountCents: attempted,
      decidedBy: null,
      authorizedBy: null,
      evidence,
      alternative: null,
      agentRationale: null,
      counterfactualCents: cents(renewal.amountCents),
    },
    result.ok
      ? {
          outcome: "EXECUTED",
          chargedCents: attempted,
          executedBy: {
            provider: "prava",
            mandateId: result.mandateId,
            chargeId: result.chargeId,
            status: result.status,
          },
          explanation: `POLICY ENGINE BYPASSED — charge of ${attempted} cents for ${vendor.name} succeeded.`,
          counterfactual: "This entry was produced by the demo bypass endpoint.",
        }
      : {
          outcome: "REFUSED",
          refusalCode:
            result.failure.kind === "DECLINED_OVER_CAP"
              ? "NETWORK_DECLINE"
              : "MANDATE_INACTIVE",
          chargedCents: cents(0),
          executedBy: {
            provider: "prava",
            mandateId: result.mandateId,
            chargeId: null,
            status: result.failure.code,
          },
          explanation: `POLICY ENGINE BYPASSED — the charge was still declined. ${result.failure.message} Nothing was charged.`,
          counterfactual: "This entry was produced by the demo bypass endpoint.",
          error: {
            code: result.failure.code,
            message: result.failure.message,
          },
        },
  );

  return NextResponse.json({
    ok: true,
    bypassed: true,
    mode,
    entryId,
    declined: !result.ok,
    failure: result.ok ? null : result.failure,
    note: result.ok
      ? "The charge SUCCEEDED. Investigate before demoing this beat."
      : "Declined beneath our own code. The ceiling is not enforced by this application.",
  });
}
