import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getClock, wallNow } from "@/lib/clock";
import { paymentBoundary } from "@/lib/prava";

export const dynamic = "force-dynamic";

/**
 * The kill switch.
 *
 * Engaging it does two things, in this order:
 *
 *   1. Sets the halt flag, so the next tick refuses to run.
 *   2. Pauses every active mandate at Prava, so the agent's authority is
 *      withdrawn at the source rather than merely ignored locally.
 *
 * Order matters. Setting the flag first means that even if pausing mandates
 * partially fails, no further tick will run — the system fails safe rather than
 * continuing on the assumption that step two worked.
 *
 * This is the most reassuring object in the product and it is reachable from
 * every page for the same reason the sandbox banner is undismissable: safety
 * affordances should never require going to look for them.
 */
export async function POST(request: Request) {
  let body: { engage?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.engage !== "boolean") {
    return NextResponse.json(
      { error: "engage must be a boolean" },
      { status: 400 },
    );
  }

  const clock = await getClock();

  await db.systemState.update({
    where: { id: "singleton" },
    data: {
      killSwitchEngaged: body.engage,
      killSwitchAt: body.engage ? clock : null,
    },
  });

  const boundary = paymentBoundary();
  const mandates = await db.mandate.findMany({
    where: { status: body.engage ? "ACTIVE" : "PAUSED" },
  });

  const changed: string[] = [];
  const failed: string[] = [];

  for (const mandate of mandates) {
    const snapshot = body.engage
      ? await boundary.pauseMandate(mandate.pravaMandateId)
      : await boundary.resumeMandate(mandate.pravaMandateId);

    if (!snapshot) {
      failed.push(mandate.pravaMandateId);
      continue;
    }

    await db.mandate.update({
      where: { vendorId: mandate.vendorId },
      data: { status: snapshot.status, refreshedAt: wallNow() },
    });
    changed.push(mandate.pravaMandateId);
  }

  return NextResponse.json({
    ok: true,
    engaged: body.engage,
    mandatesChanged: changed.length,
    // Reported, never swallowed. A partial pause is exactly the situation an
    // operator needs to know about.
    mandatesFailed: failed,
  });
}

export async function GET() {
  const state = await db.systemState.findUnique({ where: { id: "singleton" } });
  return NextResponse.json({
    engaged: state?.killSwitchEngaged ?? false,
    since: state?.killSwitchAt ?? null,
  });
}
