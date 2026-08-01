import { GENESIS_PREV_DIGEST, issueReceipt, verifyReceipt, type Receipt, type ReceiptStatus } from "./index";

/**
 * THE CLAIM ENVELOPE — receipts, generalized from actions to claims.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 *
 * A ledger entry records that something HAPPENED. It is signed, hash-linked, and
 * checkable by a stranger. That covers every statement this system used to make.
 *
 * It does not cover statements ABOUT the record:
 *
 *   "a human saw what this policy would do before granting it"
 *   "nothing moved that is missing from these entries"
 *   "N attacks ran and none executed outside authority"
 *
 * Each is a claim over a SET of entries rather than a record of one action, and
 * each would otherwise be a sentence somebody says on a stage. This envelope
 * makes them the same kind of object as everything else: canonical, signed by
 * the same key, and read by the same offline verifier.
 *
 * ---------------------------------------------------------------------------
 * ANCHORING — the part that makes claims compose
 *
 * Every claim names the ledger head it was made against, and that head is
 * carried BOTH in the envelope (so the object is self-describing) and as the
 * receipt's `prevDigest` (so it is inside the signature). A verifier checks that
 * the two agree.
 *
 * The consequence is the point: tamper with any entry and the chain breaks, and
 * so does every claim anchored at or after it. One tampered node fails
 * everything downstream, rather than leaving a signed attestation that still
 * cheerfully verifies against a record that no longer exists.
 * ---------------------------------------------------------------------------
 */

export const CLAIM_VERSION = 1;

export type ClaimType = "ACTIVATION" | "RECONCILIATION" | "ADVERSARIAL";

export interface ClaimEnvelope<T> {
  claimVersion: number;
  claimType: ClaimType;
  /** Demo clock. The time the system believed it was when it claimed this. */
  claimedAt: string;
  /**
   * Digest of the last ledger entry at the moment of the claim, or the genesis
   * value against an empty ledger.
   */
  ledgerHead: string;
  /** The claim itself. One shape per claim type. */
  subject: T;
}

export interface SignedClaim<T> {
  envelope: ClaimEnvelope<T>;
  receipt: Receipt;
}

export function buildEnvelope<T>(input: {
  claimType: ClaimType;
  claimedAt: string;
  ledgerHead: string;
  subject: T;
}): ClaimEnvelope<T> {
  return {
    claimVersion: CLAIM_VERSION,
    claimType: input.claimType,
    claimedAt: input.claimedAt,
    ledgerHead: input.ledgerHead,
    subject: input.subject,
  };
}

/**
 * Signs a claim, anchored to the ledger head.
 *
 * Inherits `issueReceipt`'s contract exactly, including the part that matters
 * most: it never throws on a signing failure. An unsigned claim is a fact the
 * interface reports as UNATTESTED. Losing the claim because the key was
 * misconfigured would be strictly worse.
 */
export function signClaim<T>(envelope: ClaimEnvelope<T>): SignedClaim<T> {
  return { envelope, receipt: issueReceipt(envelope, envelope.ledgerHead) };
}

/**
 * Verifies a claim.
 *
 * Two checks, not one. The signature proves the envelope was written by the key
 * holder and is unaltered; the anchor check proves the envelope's stated head is
 * the head that was signed. Without the second, `ledgerHead` would be a display
 * field an attacker could edit freely while the signature still verified —
 * which is precisely the failure `prevDigest`-inside-the-payload exists to
 * prevent for entries.
 */
export function verifyClaim<T>(input: {
  claim: SignedClaim<T>;
  publicKeyB64: string | null;
}): ReceiptStatus {
  const { envelope, receipt } = input.claim;

  if (receipt.prevDigest !== envelope.ledgerHead) return "BROKEN_LINK";

  return verifyReceipt({
    record: envelope,
    receipt,
    publicKeyB64: input.publicKeyB64,
    // Already checked above, and checked against the envelope's own claim
    // rather than against a position in a chain — claims are anchored, not
    // sequenced.
    expectedPrevDigest: null,
  });
}

export { GENESIS_PREV_DIGEST };
