import { NextResponse } from "next/server";
import { getClock } from "@/lib/clock";
import {
  approve,
  expireStaleApprovals,
  listApprovals,
  reject,
} from "@/lib/outcome/approvals";

export const dynamic = "force-dynamic";

const DEMO_APPROVER = "owner@example.com";

export async function GET() {
  const clock = await getClock();
  // Expire on read as well as on tick, so the list is never showing something
  // as actionable that has already gone stale.
  await expireStaleApprovals(clock);
  return NextResponse.json({ approvals: await listApprovals() });
}

/**
 * Approve or reject.
 *
 * Approving a CEILING_RAISE here records intent and NOTHING ELSE. It does not
 * raise a ceiling and cannot — the response says so explicitly, and the charge
 * stays impossible until the owner completes a passkey ceremony on Prava's
 * surface. See ./passkey.
 */
export async function POST(request: Request) {
  let body: { id?: unknown; decision?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.id !== "string") {
    return NextResponse.json({ error: "id must be a string" }, { status: 400 });
  }
  if (body.decision !== "APPROVE" && body.decision !== "REJECT") {
    return NextResponse.json(
      { error: "decision must be APPROVE or REJECT" },
      { status: 400 },
    );
  }

  const clock = await getClock();
  const result =
    body.decision === "APPROVE"
      ? await approve({ id: body.id, approverId: DEMO_APPROVER, clock })
      : await reject({ id: body.id, approverId: DEMO_APPROVER, clock });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    type: result.type,
    requiresPasskey: result.requiresPasskey,
    note: result.requiresPasskey
      ? "Recorded. This does NOT raise the ceiling — that needs a passkey ceremony."
      : "Approved within existing mandate authority.",
  });
}
