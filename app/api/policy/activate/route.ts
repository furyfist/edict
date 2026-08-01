import { NextResponse } from "next/server";
import { getClock } from "@/lib/clock";
import { checkPreview, recordActivation } from "@/lib/policy/activation";
import { activateVersion, getVersion, toPolicy } from "@/lib/policy/versions";

export const dynamic = "force-dynamic";

/**
 * The confirmation gate — where a draft becomes authority.
 *
 * Deliberately a separate endpoint from compilation. A human has seen the
 * compiled rules beside their own sentences, and now also what those rules would
 * do, and said yes. Nothing about a successful compile implies this call, and
 * there is no automatic path to it.
 *
 * Activating a policy does not touch any mandate. Ceilings live on the card
 * network and move only through a passkey ceremony.
 *
 * ---------------------------------------------------------------------------
 * THE PREVIEW GATE
 *
 * The client sends the digest of the preview it rendered. The server rebuilds
 * that preview and refuses the activation if the two disagree — see
 * lib/policy/activation.ts for why trusting the client's number would make the
 * resulting record worthless. A stale preview is a 409: recompile, look again,
 * then confirm.
 * ---------------------------------------------------------------------------
 */
export async function POST(request: Request) {
  let body: { policyVersionId?: unknown; previewDigest?: unknown };
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

  const claimedDigest =
    typeof body.previewDigest === "string" ? body.previewDigest : null;

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

  const policy = toPolicy(version);
  const check = await checkPreview(policy, claimedDigest);

  if (!check.ok) {
    return NextResponse.json(
      {
        error:
          "The preview you were shown no longer matches what this policy would do. " +
          "Nothing has been activated. Compile again and read the new preview.",
        expected: check.expected,
        received: check.received,
      },
      { status: 409 },
    );
  }

  const clock = await getClock();
  await activateVersion(version.id, clock);

  // Signed after the fact, because the claim is that this activation HAPPENED
  // and was preceded by that preview. A signing failure must not undo an
  // activation that already took effect — the record reads UNATTESTED and the
  // interface says so.
  const claim = await recordActivation({ policy, check, clock });

  return NextResponse.json({
    ok: true,
    policyVersionId: version.id,
    version: version.version,
    status: "ACTIVE",
    ruleCount: version.rules.length,
    attested: claim.receipt.signature !== null,
    previewDigest: check.digest,
    ledgerHead: claim.envelope.ledgerHead,
    receiptDigest: claim.receipt.digest,
  });
}
