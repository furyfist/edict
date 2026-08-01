import { NextResponse } from "next/server";
import { rejectApproval } from "@/lib/approvals";

export const dynamic = "force-dynamic";

/**
 * Reject an approval.
 *
 * Writes a refusal and closes the action for the cycle. A rejection is a
 * decision, not an absence of one, and it lands in the ledger alongside
 * everything else with the rejecting human named as the authorizer.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  let rejectedBy: string;
  let note: string | undefined;

  try {
    const body = (await request.json()) as {
      rejectedBy?: unknown;
      note?: unknown;
    };
    if (typeof body.rejectedBy !== "string" || !body.rejectedBy.trim()) {
      return NextResponse.json(
        { error: "rejectedBy is required — every decision is attributed" },
        { status: 400 },
      );
    }
    rejectedBy = body.rejectedBy.trim();
    note = typeof body.note === "string" ? body.note.slice(0, 500) : undefined;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await rejectApproval(id, rejectedBy, note);

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    entryId: result.entryId,
    detail: result.detail,
  });
}
