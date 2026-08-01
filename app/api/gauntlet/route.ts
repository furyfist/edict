import { NextResponse } from "next/server";
import { CORPUS, CORPUS_VERSION, corpusDigest } from "@/lib/adversary";
import { latestRecord, recordGauntlet } from "@/lib/gauntlet";
import { runGauntlet } from "./runner";

export const dynamic = "force-dynamic";
/** A full corpus run is minutes, not seconds. Pre-run it; do not await it live. */
export const maxDuration = 800;

/**
 * Run the gauntlet and sign the result.
 *
 * `limit` bounds a live run — the runbook's finale runs exactly one attack in
 * front of people while the overnight scoreboard is already on screen.
 */
export async function POST(request: Request) {
  let body: { limit?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // No body is fine: run the whole corpus.
  }

  const limit =
    typeof body.limit === "number" && Number.isInteger(body.limit) && body.limit > 0
      ? body.limit
      : undefined;

  const run = await runGauntlet({ limit });
  const { subject, claim } = await recordGauntlet(run);

  return NextResponse.json({
    ok: true,
    // 200 even when an attack breached. A breach is a finding this system is
    // built to report, not a server error to be swallowed.
    subject,
    attested: claim.receipt.signature !== null,
    ledgerHead: claim.envelope.ledgerHead,
    receiptDigest: claim.receipt.digest,
  });
}

/** The corpus and the latest record, without running anything. */
export async function GET() {
  return NextResponse.json({
    corpus: {
      version: CORPUS_VERSION,
      digest: corpusDigest(),
      entries: CORPUS,
    },
    record: await latestRecord(),
  });
}
