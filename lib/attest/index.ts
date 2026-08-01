/**
 * ATTESTATION — signed, hash-linked receipts for records that must survive
 * leaving this system.
 *
 * The ledger's other guarantees are mechanisms: the module graph forbids the
 * agent a path to money, the engine is pure, the ceiling lives in a tokenized
 * credential. "Append-only" was the one guarantee that was a PROMISE — true,
 * but only checkable by someone who reads our code and trusts our database.
 *
 * A receipt turns that promise into a mechanism. It proves the record was
 * written by the holder of the signing key and has not been altered since, and
 * the chain link proves no record was removed from between two others.
 *
 * WHAT IT DOES NOT PROVE: that the record was true when written. Nothing signed
 * by us can establish that. The external check remains the Prava dashboard
 * cross-reference. Said out loud in docs/disclosure.md rather than left to be
 * discovered.
 */

import { sign as edSign, verify as edVerify } from "node:crypto";
import { CANON_VERSION, canonicalize, digestOf } from "./canonical";
import { getSigningIdentity } from "./keys";

export { CANON_VERSION, canonicalize, digestOf } from "./canonical";
export {
  generateSigningIdentity,
  getPublicIdentity,
  getSigningIdentity,
  resetSigningIdentityCache,
} from "./keys";
export type { PublicIdentity, SigningIdentity } from "./keys";

/** The genesis link. The first entry in a chain has no predecessor. */
export const GENESIS_PREV_DIGEST =
  "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * What actually gets signed.
 *
 * The chain link is INSIDE the signed payload, not beside it. If `prevDigest`
 * sat outside the signature, an attacker could relink entries into a different
 * order and every signature would still verify.
 */
export interface ReceiptPayload<T> {
  canonVersion: string;
  prevDigest: string;
  record: T;
}

export interface Receipt {
  canonVersion: string;
  prevDigest: string;
  /** SHA-256 over the canonical payload. The next entry links to this. */
  digest: string;
  /** Base64 Ed25519 signature, or null when no key was configured. */
  signature: string | null;
  keyId: string | null;
}

export function buildPayload<T>(record: T, prevDigest: string): ReceiptPayload<T> {
  return { canonVersion: CANON_VERSION, prevDigest, record };
}

/**
 * Issues a receipt over a record.
 *
 * NEVER THROWS on a signing failure. The digest and the chain link are computed
 * regardless, so the chain stays continuous even across an unsigned entry, and
 * the caller can always complete its write. An unsigned receipt is a fact the
 * interface reports; a lost ledger entry is a violated invariant.
 */
export function issueReceipt<T>(record: T, prevDigest: string): Receipt {
  const payload = buildPayload(record, prevDigest);
  const digest = digestOf(payload);

  let signature: string | null = null;
  let keyId: string | null = null;

  try {
    const identity = getSigningIdentity();
    if (identity) {
      const bytes = Buffer.from(canonicalize(payload), "utf8");
      signature = edSign(null, bytes, identity.privateKey).toString("base64");
      keyId = identity.keyId;
    }
  } catch (error) {
    // Deliberately swallowed. See the contract above: a signing problem must
    // never cost us the record of a charge that already happened.
    console.error("[attest] signing failed, entry will be unattested:", error);
  }

  return { canonVersion: CANON_VERSION, prevDigest, digest, signature, keyId };
}

/**
 * Four states, never three.
 *
 * UNATTESTED and INVALID are different facts and collapsing them would be the
 * same mistake the evidence bundle refuses to make with zero and unknown. An
 * entry written before receipts existed is not a forgery.
 */
export type ReceiptStatus = "VALID" | "INVALID" | "UNATTESTED" | "BROKEN_LINK";

export interface VerifyInput<T> {
  record: T;
  receipt: Receipt;
  /** Base64 SPKI. */
  publicKeyB64: string | null;
  /** The predecessor's digest, or GENESIS_PREV_DIGEST for the first entry. */
  expectedPrevDigest: string | null;
}

export function verifyReceipt<T>(input: VerifyInput<T>): ReceiptStatus {
  const { record, receipt, publicKeyB64, expectedPrevDigest } = input;

  if (!receipt.signature) return "UNATTESTED";

  // Chain first: a relinked entry is a different failure from a rewritten one,
  // and the demo depends on being able to say which happened.
  if (
    expectedPrevDigest !== null &&
    receipt.prevDigest !== expectedPrevDigest
  ) {
    return "BROKEN_LINK";
  }

  const payload = buildPayload(record, receipt.prevDigest);

  let canonical: string;
  try {
    canonical = canonicalize(payload);
  } catch {
    return "INVALID";
  }

  if (digestOf(payload) !== receipt.digest) return "INVALID";

  if (!publicKeyB64) return "UNATTESTED";

  try {
    const ok = edVerify(
      null,
      Buffer.from(canonical, "utf8"),
      {
        key: Buffer.from(publicKeyB64, "base64"),
        format: "der",
        type: "spki",
      },
      Buffer.from(receipt.signature, "base64"),
    );
    return ok ? "VALID" : "INVALID";
  } catch {
    return "INVALID";
  }
}
