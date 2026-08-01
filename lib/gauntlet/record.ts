import { db } from "../db/client";
import { buildEnvelope, signClaim, type SignedClaim } from "../attest/claims";
import { corpusDigest } from "../adversary";
import { ledgerHead } from "../ledger";
import { latestAttestation } from "../reconcile/attest";
import { summarize, type AdversarialSummary, type CompletenessAnchor } from "./aggregate";
import type { GauntletRun } from "./types";

/**
 * THE ADVERSARIAL RECORD — the third claim type, and the artifact a judge
 * carries out of the room.
 *
 * ---------------------------------------------------------------------------
 * TWO ANCHORS, NOT ONE
 *
 * Every claim in this system anchors to a ledger head. This one anchors to a
 * ledger head AND cites the reconciliation attestation its headline depends on.
 *
 * The reason is the whole shape of V2. "N attacks, zero unauthorized charges"
 * is a claim about MONEY, but the gauntlet can only see the LEDGER. The gap
 * between those two is exactly the gap two-sided reconciliation closes, so a
 * record that made the strong claim without citing a completeness proof would
 * be asserting something it has no way to know.
 *
 * So the citation is a field, the honesty is computed, and the headline
 * degrades on its own when the proof underneath it is missing, stale, or
 * failing. Nobody has to remember to soften the wording.
 * ---------------------------------------------------------------------------
 */

export type AdversarialSubject = AdversarialSummary;

/**
 * Reads the completeness proof this record will stand on.
 *
 * `unproven` is true unless there is a BALANCED attestation anchored to the
 * ledger head this record is being written against. Anything else — none,
 * stale, discrepant, unverifiable — cannot support the strong claim.
 */
async function completenessAt(head: string): Promise<CompletenessAnchor> {
  const attestation = await latestAttestation();

  if (!attestation) {
    return {
      attestationDigest: null,
      status: null,
      ledgerHead: null,
      unproven: true,
    };
  }

  const row = await db.claim.findUnique({
    where: { id: attestation.id },
    select: { receiptDigest: true },
  });

  const status = attestation.subject.status;

  return {
    attestationDigest: row?.receiptDigest ?? null,
    status,
    ledgerHead: attestation.ledgerHead,
    // Stale is judged against THIS record's head, not against "now". A record
    // is a statement about a moment, and the proof it cites has to be a
    // statement about the same moment.
    unproven: status !== "BALANCED" || attestation.ledgerHead !== head,
  };
}

/** Aggregates a completed run, signs it, and persists it. */
export async function recordGauntlet(
  run: GauntletRun,
): Promise<{ subject: AdversarialSubject; claim: SignedClaim<AdversarialSubject> }> {
  const head = await ledgerHead();
  const completeness = await completenessAt(head);

  const subject = summarize({
    run,
    corpusDigest: corpusDigest(),
    completeness,
  });

  const claim = signClaim(
    buildEnvelope({
      claimType: "ADVERSARIAL",
      claimedAt: run.finishedAt,
      ledgerHead: head,
      subject,
    }),
  );

  await db.claim.create({
    data: {
      type: "ADVERSARIAL",
      clockAt: new Date(run.finishedAt),
      ledgerHead: head,
      subject: JSON.parse(JSON.stringify(subject)),
      receiptDigest: claim.receipt.digest,
      receiptPrevDigest: claim.receipt.prevDigest,
      receiptSignature: claim.receipt.signature,
      receiptKeyId: claim.receipt.keyId,
      receiptCanonVersion: claim.receipt.canonVersion,
    },
  });

  return { subject, claim };
}

export interface StoredAdversarialRecord {
  id: string;
  ranAt: Date;
  ledgerHead: string;
  subject: AdversarialSubject;
  attested: boolean;
  stale: boolean;
}

/** The most recent adversarial record. */
export async function latestRecord(): Promise<StoredAdversarialRecord | null> {
  const [row, head] = await Promise.all([
    db.claim.findFirst({
      where: { type: "ADVERSARIAL" },
      orderBy: { createdAt: "desc" },
    }),
    ledgerHead(),
  ]);

  if (!row) return null;

  return {
    id: row.id,
    ranAt: row.clockAt,
    ledgerHead: row.ledgerHead,
    subject: row.subject as unknown as AdversarialSubject,
    attested: row.receiptSignature !== null,
    stale: row.ledgerHead !== head,
  };
}
