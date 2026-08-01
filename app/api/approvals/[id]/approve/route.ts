import { NextResponse } from "next/server";
import { approvePolicyException } from "@/lib/approvals";
import { requiresPasskeyCeremony } from "@/lib/approvals/ceiling";

export const dynamic = "force-dynamic";

/**
 * Approve a policy exception — in-app, no passkey.
 *
 * This route permits one charge within authority that already exists. It
 * refuses anything that would need more, and it refuses by name rather than
 * by silently doing less: the response says a passkey ceremony is required,
 * because an operator who clicks approve and sees nothing happen will click
 * it again rather than reaching for the ceremony.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  let approvedBy: string;
  try {
    const body = (await request.json()) as { approvedBy?: unknown };
    if (typeof body.approvedBy !== "string" || !body.approvedBy.trim()) {
      return NextResponse.json(
        { error: "approvedBy is required — every approval is attributed" },
        { status: 400 },
      );
    }
    approvedBy = body.approvedBy.trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  // The gate that keeps the two paths separate. An in-app approval cannot
  // raise a ceiling, and this refuses before touching the adapter rather than
  // letting the network refuse it later.
  if (await requiresPasskeyCeremony(id)) {
    return NextResponse.json(
      {
        error:
          "This charge exceeds the authority the mandate holds. Raising it requires a passkey ceremony — an in-app approval cannot grant authority.",
        requiresPasskey: true,
      },
      { status: 409 },
    );
  }

  const result = await approvePolicyException(id, approvedBy);

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    entryId: result.entryId,
    charged: result.charged,
    detail: result.detail,
  });
}
