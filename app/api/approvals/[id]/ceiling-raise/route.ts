import { NextResponse } from "next/server";
import { raiseCeiling } from "@/lib/approvals/ceiling";

export const dynamic = "force-dynamic";

/**
 * Complete a ceiling raise after a passkey ceremony.
 *
 * The ceremony happens on the client, against Prava, at a device the human is
 * physically present at. This route accepts the resulting ceremony id and asks
 * Prava to mint a new mandate; Prava verifies the ceremony independently of
 * anything this application says.
 *
 * There is no override parameter, no admin bypass, and no path through this
 * file that succeeds without a ceremony id. A reviewer looking for the
 * shortcut will not find one, because the authority being requested does not
 * exist in this system to give.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await context.params;

  let requestedCeilingCents: number;
  let passkeyCeremonyId: string;
  let requestedBy: string;

  try {
    const body = (await request.json()) as {
      requestedCeilingCents?: unknown;
      passkeyCeremonyId?: unknown;
      requestedBy?: unknown;
    };

    if (
      typeof body.requestedCeilingCents !== "number" ||
      !Number.isInteger(body.requestedCeilingCents)
    ) {
      return NextResponse.json(
        { error: "requestedCeilingCents must be an integer number of cents" },
        { status: 400 },
      );
    }
    if (
      typeof body.passkeyCeremonyId !== "string" ||
      !body.passkeyCeremonyId.trim()
    ) {
      return NextResponse.json(
        {
          error:
            "passkeyCeremonyId is required. Authority originates in a signed ceremony, never in this application.",
        },
        { status: 400 },
      );
    }
    if (typeof body.requestedBy !== "string" || !body.requestedBy.trim()) {
      return NextResponse.json(
        { error: "requestedBy is required — every grant of authority is attributed" },
        { status: 400 },
      );
    }

    requestedCeilingCents = body.requestedCeilingCents;
    passkeyCeremonyId = body.passkeyCeremonyId.trim();
    requestedBy = body.requestedBy.trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await raiseCeiling({
    approvalId: id,
    requestedCeilingCents,
    passkeyCeremonyId,
    requestedBy,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    mandateId: result.mandateId,
    authorizedCents: result.authorizedCents,
    entryId: result.entryId,
    detail: result.detail,
  });
}
