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
 * Three modes:
 *
 *   over_cap — charge above the mandate ceiling. Expected: a Visa decline,
 *              surfaced as THRESHOLD_EXCEEDED.
 *   paused   — pause the mandate first, then charge. Enforcement fully under
 *              our control, and the documented fallback if over_cap does not
 *              decline as the API reference describes.
 *   omission — charge UNDER the ceiling, so it succeeds, and suppress the
 *              ledger write. See below.
 *
 * ---------------------------------------------------------------------------
 * THE OMISSION MODE IS A DIFFERENT KIND OF ATTACK
 *
 * The first two modes attack the CEILING and lose. This one does not attack the
 * ceiling at all — it stays underneath it, where the network has no objection,
 * and attacks the RECORD instead by simply not writing one.
 *
 * That is the attack an append-only ledger cannot survive on its own. Nothing is
 * altered, no signature breaks, no chain link fails, and the money is gone. It
 * is the reason two-sided reconciliation exists, and it is the only way to
 * demonstrate that reconciliation does anything.
 *
 * It steals from ourselves, using our own admin access, on purpose, and it is
 * labelled as such wherever it appears. Like the tamper control, it is not a
 * feature — it is a demonstration of the one attack our own guarantees do not
 * cover, immediately followed by the thing that does cover it.
 * ---------------------------------------------------------------------------
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

  const mode =
    body.mode === "paused"
      ? "paused"
      : body.mode === "omission"
        ? "omission"
        : "over_cap";
  const clock = await getClock();

  // One wave. Three independent lookups that used to be three round trips, on a
  // path where the whole point is that it finishes in a couple of seconds while
  // somebody is watching.
  const [mandate, vendor, renewal] = await Promise.all([
    db.mandate.findUnique({ where: { vendorId: body.vendorId } }),
    db.vendor.findUnique({ where: { id: body.vendorId } }),
    db.renewal.findFirst({
      where: { vendorId: body.vendorId },
      orderBy: { cycleStart: "desc" },
    }),
  ]);

  if (!mandate || !vendor) {
    return NextResponse.json(
      { error: "vendor has no mandate" },
      { status: 404 },
    );
  }

  if (!renewal) {
    return NextResponse.json({ error: "no renewal" }, { status: 404 });
  }

  const amountCents =
    typeof body.amountCents === "number" && Number.isInteger(body.amountCents)
      ? cents(body.amountCents)
      : (cents(mandate.capCents * 20) as Cents);

  const boundary = paymentBoundary();

  // -- omission: money moves, nothing is recorded ----------------------------
  //
  // Deliberately UNDER the ceiling, because the point is not to test the
  // ceiling. A charge the network is perfectly happy to authorize, followed by
  // the absence of a ledger write. No entry, no tick, no receipt, no chain
  // break — the record is intact and silent.
  if (mode === "omission") {
    const stolen = cents(
      Math.max(1, Math.min(mandate.remainingCents, renewal.amountCents)),
    );

    const theft = await boundary.charge({
      mandateId: mandate.pravaMandateId,
      amountCents: stolen,
      currency: "USD",
      idempotencyKey: `omission:${renewal.id}:${wallNow().getTime()}`,
    });

    if (!theft.ok) {
      return NextResponse.json({
        ok: true,
        bypassed: true,
        mode,
        declined: true,
        failure: theft.failure,
        note:
          "The under-cap charge was declined, so nothing was omitted. Check the " +
          "mandate has headroom before running this beat.",
      });
    }

    // No appendEntry. That absence IS the attack.
    return NextResponse.json({
      ok: true,
      bypassed: true,
      mode,
      declined: false,
      vendorName: vendor.name,
      mandateId: theft.mandateId,
      chargeId: theft.chargeId,
      amountCents: stolen,
      entryId: null,
      note:
        `${vendor.name} was charged ${stolen} cents and NO ledger entry was written. ` +
        "The chain is intact, every signature still verifies, and the record is " +
        "wrong. Run reconciliation on the Authority page.",
    });
  }

  // Built only for the modes that write an entry. The omission mode returns
  // above without one, and assembling five queries' worth of evidence for a
  // record we are deliberately not writing added seconds to a live beat.
  const evidence = await buildEvidenceBundle({
    renewalId: renewal.id,
    clock,
  });
  if (!evidence) {
    return NextResponse.json({ error: "no evidence" }, { status: 404 });
  }

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
