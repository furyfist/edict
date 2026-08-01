import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { addDays, getClock } from "@/lib/clock";
import { getApproval, recordPasskey } from "@/lib/outcome/approvals";
import { openMandateSetup } from "@/lib/prava/mandates";
import type { Cents, Frequency } from "@/lib/contracts";

export const dynamic = "force-dynamic";

const OWNER_ID = "owner-1";
const OWNER_EMAIL = "owner@example.com";

/**
 * The ceiling raise — the only path that creates new authority.
 *
 * Opens a mandate-setup session with Prava and returns the approval URL. The
 * owner completes a passkey ceremony there; the mandate does not exist until
 * they do. This endpoint cannot mint a ceiling, only ask for one.
 *
 * There is deliberately no override, no admin bypass, and no "force" flag. If
 * one appeared here it would invalidate the entire product argument.
 */
export async function POST(request: Request) {
  let body: { approvalId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.approvalId !== "string") {
    return NextResponse.json(
      { error: "approvalId must be a string" },
      { status: 400 },
    );
  }

  const approval = await getApproval(body.approvalId);
  if (!approval) {
    return NextResponse.json({ error: "no such approval" }, { status: 404 });
  }
  if (approval.type !== "CEILING_RAISE") {
    return NextResponse.json(
      {
        error:
          "This approval is within existing authority and does not need a passkey.",
      },
      { status: 409 },
    );
  }

  const vendor = await db.vendor.findUnique({ where: { id: approval.vendorId } });
  const renewal = await db.renewal.findFirst({
    where: { vendorId: approval.vendorId },
    orderBy: { cycleStart: "desc" },
  });
  if (!vendor || !renewal) {
    return NextResponse.json({ error: "vendor not found" }, { status: 404 });
  }

  const clock = await getClock();

  const setup = await openMandateSetup({
    vendorName: vendor.name,
    ownerId: OWNER_ID,
    ownerEmail: OWNER_EMAIL,
    capCents: approval.amountCents as Cents,
    frequency: renewal.frequency as Frequency,
    validUntil: addDays(clock, 365).toISOString(),
    maxCharges: 12,
  });

  if (!setup.ok) {
    // No provider at all. Not an error to hide — it is the invariant, visible.
    //
    // The approval has already been recorded as intent by /api/approvals, and
    // the ceiling has not moved, because approving in this application never
    // moves it. Without a ceremony there is simply no new authority, and the
    // correct behaviour is to say so rather than to invent one.
    //
    // The operator hint goes to the server log, not to the response. A raw
    // environment variable name rendered on a projector reads as a broken
    // build; the sentence below reads as the system refusing to pretend.
    if (setup.unavailable) {
      console.warn(
        "[passkey] mandate setup unavailable — PRAVA_SECRET_KEY is not set. " +
          "Beat 4 will show the unavailable state. See docs/runbook.md.",
      );

      return NextResponse.json(
        {
          available: false,
          approvalId: approval.id,
          ceilingMoved: false,
          message:
            "No payment provider is connected, so no passkey ceremony can be opened.",
          detail:
            "Your approval is recorded and the ceiling is unchanged — approving here never moves it. Without a ceremony there is no new authority, and this system will not pretend otherwise.",
        },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: setup.error }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    approvalId: approval.id,
    approvalUrl: setup.approvalUrl,
    expiresAt: setup.expiresAt,
    note: "Complete the passkey ceremony at approvalUrl. The ceiling does not move until you do.",
  });
}

/**
 * Confirms the ceremony completed.
 *
 * The only way `passkeyAt` is ever set on an approval. Called after Prava
 * reports the new mandate active — never optimistically.
 */
export async function PATCH(request: Request) {
  let body: { approvalId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.approvalId !== "string") {
    return NextResponse.json(
      { error: "approvalId must be a string" },
      { status: 400 },
    );
  }

  const clock = await getClock();
  const recorded = await recordPasskey({ id: body.approvalId, clock });

  if (!recorded) {
    return NextResponse.json(
      { error: "not a ceiling-raise approval" },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, passkeyAt: clock.toISOString() });
}
