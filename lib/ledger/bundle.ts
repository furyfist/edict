import { CANON_VERSION, getPublicIdentity } from "../attest";
import type { LedgerReceipt } from "../contracts";
import { verifiedChain } from "./read";
import { toSignedRecord, type SignedRecord } from "./record";

/**
 * The portable bundle — the ledger, off the premises.
 *
 * Signing without portability is theatre. This is the artifact a judge, an
 * auditor, or a counterparty takes away and checks with
 * `scripts/verify-receipts.mjs` on their own machine, with this application
 * closed and the database unreachable.
 *
 * Self-contained on purpose: the records, the receipts, the public key, and the
 * canonicalization version. Nothing else is needed to verify it.
 *
 * ---------------------------------------------------------------------------
 * WHAT NEVER LEAVES
 *
 * §8's "never stored" list applies verbatim to what is exported: no card data,
 * no payment tokens, no passkey material, no Prava secret, no raw model
 * prompts, no real personal data. The private signing key is not here and
 * cannot be — only its public half, which is the entire point.
 * ---------------------------------------------------------------------------
 */

export interface BundleItem {
  record: SignedRecord;
  /**
   * Null for entries written before receipts existed.
   *
   * They are exported anyway. Quietly omitting the records we cannot attest
   * would be the one place this system hid something inconvenient, and the
   * verifier reports them as unattested — which is the truth.
   */
  receipt: LedgerReceipt | null;
}

export interface ReceiptBundle {
  format: "spend-guardian-receipts";
  formatVersion: 1;
  canonVersion: string;
  /** Wall clock. Operational metadata, not part of any signature. */
  exportedAt: string;
  key: {
    algorithm: string;
    keyId: string;
    /** Base64 SPKI. Carried for convenience — see the note below. */
    publicKeyB64: string;
  } | null;
  /**
   * True when this is a slice rather than the whole ledger. A slice can prove
   * its signatures but cannot prove nothing was removed before it, and the
   * verifier says so rather than implying a guarantee it does not have.
   */
  partial: boolean;
  entries: BundleItem[];
  /**
   * Read this before trusting the bundle.
   *
   * Embedding the public key is a convenience, not a trust anchor. A bundle
   * that carries its own key proves internal consistency; to prove it came from
   * us, compare the key id against the one published at /api/receipts/key.
   */
  notice: string;
}

const NOTICE =
  "The public key in this bundle is a convenience, not a trust anchor. " +
  "Verify the keyId against the one published by the issuer before relying on " +
  "these signatures. A receipt proves this record was written by the holder of " +
  "that key and has not been altered since. It does not prove the record was " +
  "true when written.";

export async function buildBundle(options: { entryId?: string } = {}): Promise<
  ReceiptBundle
> {
  const chain = await verifiedChain();
  const identity = getPublicIdentity();

  const selected = options.entryId
    ? chain.filter((item) => item.entry.id === options.entryId)
    : chain;

  const entries: BundleItem[] = selected.map((item) => ({
    record: toSignedRecord(item.entry),
    receipt: item.entry.receipt,
  }));

  return {
    format: "spend-guardian-receipts",
    formatVersion: 1,
    canonVersion: CANON_VERSION,
    exportedAt: new Date().toISOString(),
    key: identity
      ? {
          algorithm: identity.algorithm,
          keyId: identity.keyId,
          publicKeyB64: identity.publicKeyB64,
        }
      : null,
    partial: Boolean(options.entryId),
    entries,
    notice: NOTICE,
  };
}
