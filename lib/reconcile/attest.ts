import { db } from "../db/client";
import { buildEnvelope, signClaim, type SignedClaim } from "../attest/claims";
import { ledgerHead } from "../ledger";
import { containmentSentence, runReconciliation } from "./run";
import type {
  ContainmentStatus,
  ReconciliationRun,
  UnreadableMandate,
} from "./run";
import type { Discrepancy } from "./core";

/**
 * THE RECONCILIATION ATTESTATION — the second claim type.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS SIGNED AT ALL
 *
 * "The books balance" is exactly the kind of sentence that is worthless when
 * spoken and valuable when signed. Unsigned, it is a screenshot. Signed and
 * anchored, it is a statement that a specific pair of books agreed at a specific
 * state of the record — checkable later, by a stranger, offline.
 *
 * The anchor does the compositional work. `ledgerHead` is inside the signature,
 * so an attestation cannot be moved to a different point in history, and any
 * tampering with an entry at or before that head breaks the chain AND every
 * attestation standing on it. That is what makes M3's headline claim sound:
 * "zero unauthorized charges" only means anything if the ledger is provably
 * complete, and this is the proof it cites.
 *
 * ---------------------------------------------------------------------------
 * AN UNVERIFIABLE RUN IS STILL ATTESTED
 *
 * It would be easy to sign only the happy result. That would make the presence
 * of an attestation meaningless — every one would say "balanced" because the
 * others were never written.
 *
 * So UNVERIFIABLE and DISCREPANT runs are signed too, with their reasons and
 * their named discrepancies inside the signature. A signed admission is worth
 * more than an unsigned reassurance, and it is the only version of this that
 * cannot be gamed by choosing when to run it.
 * ---------------------------------------------------------------------------
 */

export interface ReconciliationSubject {
  status: ContainmentStatus;
  /** Which implementation answered. A mock reconciliation is never dressed as real. */
  provider: "mock" | "prava";
  ranAt: string;

  mandatesChecked: number;
  entriesChecked: number;
  chargesChecked: number;
  matched: number;

  /** Named, never counted. The identifiers are the point. */
  discrepancies: Discrepancy[];
  unreadable: UnreadableMandate[];

  /**
   * The sentence rendered to the operator, signed alongside the numbers it
   * describes — so the words and the data cannot drift apart in a screenshot.
   */
  sentence: string;
}

export function subjectOf(run: ReconciliationRun): ReconciliationSubject {
  return {
    status: run.status,
    provider: run.provider,
    ranAt: run.ranAt,
    mandatesChecked: run.mandatesChecked,
    entriesChecked: run.entriesChecked,
    chargesChecked: run.chargesChecked,
    matched: run.matched,
    discrepancies: run.discrepancies,
    unreadable: run.unreadable,
    sentence: containmentSentence(run),
  };
}

/**
 * Runs a reconciliation, signs the result, and persists it.
 *
 * Signed AFTER the comparison, over what the comparison actually found. There is
 * no path here that signs an expectation.
 */
export async function attestReconciliation(): Promise<{
  run: ReconciliationRun;
  claim: SignedClaim<ReconciliationSubject>;
}> {
  const run = await runReconciliation();
  const subject = subjectOf(run);

  const claim = signClaim(
    buildEnvelope({
      claimType: "RECONCILIATION",
      claimedAt: run.ranAt,
      ledgerHead: await ledgerHead(),
      subject,
    }),
  );

  await db.claim.create({
    data: {
      type: "RECONCILIATION",
      clockAt: new Date(run.ranAt),
      ledgerHead: claim.envelope.ledgerHead,
      subject: JSON.parse(JSON.stringify(subject)),
      receiptDigest: claim.receipt.digest,
      receiptPrevDigest: claim.receipt.prevDigest,
      receiptSignature: claim.receipt.signature,
      receiptKeyId: claim.receipt.keyId,
      receiptCanonVersion: claim.receipt.canonVersion,
    },
  });

  return { run, claim };
}

export interface StoredAttestation {
  id: string;
  ranAt: Date;
  ledgerHead: string;
  subject: ReconciliationSubject;
  attested: boolean;
  /**
   * True when the ledger has moved since this attestation was made.
   *
   * Rendered, never hidden. An attestation is a claim about a moment, and a
   * stale one silently presented as current would be the most misleading thing
   * this page could do.
   */
  stale: boolean;
}

/** The most recent reconciliation attestation, with its staleness computed. */
export async function latestAttestation(): Promise<StoredAttestation | null> {
  const [row, head] = await Promise.all([
    db.claim.findFirst({
      where: { type: "RECONCILIATION" },
      orderBy: { createdAt: "desc" },
    }),
    ledgerHead(),
  ]);

  if (!row) return null;

  return {
    id: row.id,
    ranAt: row.clockAt,
    ledgerHead: row.ledgerHead,
    subject: row.subject as unknown as ReconciliationSubject,
    attested: row.receiptSignature !== null,
    stale: row.ledgerHead !== head,
  };
}
