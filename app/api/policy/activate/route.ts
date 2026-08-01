import { NextResponse } from "next/server";
import { getClock } from "@/lib/clock";
import { activateVersion, getVersion } from "@/lib/policy/versions";

export const dynamic = "force-dynamic";

/**
 * The confirmation gate — where a draft becomes authority.
 *
 * Deliberately a separate endpoint from compilation. A human has seen the
 * compiled rules beside their own sentences and said yes. Nothing about a
 * successful compile implies this call, and there is no automatic path to it.
 *
 * Activating a policy does not touch any mandate. Ceilings live on the card
 * network and move only through a passkey ceremony.
 */
export async function POST(request: Request) {
  let body: { policyVersionId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.policyVersionId !== "string") {
    return NextResponse.json(
      { error: "policyVersionId must be a string" },
      { status: 400 },
    );
  }

  const version = await getVersion(body.policyVersionId);
  if (!version) {
    return NextResponse.json({ error: "unknown policy version" }, { status: 404 });
  }
  if (version.status === "SUPERSEDED") {
    return NextResponse.json(
      { error: "this version has been superseded and cannot be reactivated" },
      { status: 409 },
    );
  }

  await activateVersion(version.id, await getClock());

  return NextResponse.json({
    ok: true,
    policyVersionId: version.id,
    version: version.version,
    status: "ACTIVE",
    ruleCount: version.rules.length,
  });
}
