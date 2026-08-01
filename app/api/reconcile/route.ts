import { NextResponse } from "next/server";
import { attestReconciliation, latestAttestation } from "@/lib/reconcile/attest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Run a reconciliation and sign the result.
 *
 * A POST because it creates a record. Note what it does NOT do: it moves no
 * money, opens no session, and touches no mandate. Reconciliation is entirely
 * downstream of execution — it reads two books and compares them.
 */
export async function POST() {
  const { run, claim } = await attestReconciliation();

  return NextResponse.json({
    ok: true,
    // The HTTP status stays 200 for a discrepant run. A discrepancy is a
    // finding, not a server error, and the caller must render it rather than
    // treat it as a failed request.
    status: run.status,
    run,
    attested: claim.receipt.signature !== null,
    ledgerHead: claim.envelope.ledgerHead,
    receiptDigest: claim.receipt.digest,
  });
}

/** The latest attestation, without running a new one. */
export async function GET() {
  return NextResponse.json({ attestation: await latestAttestation() });
}
