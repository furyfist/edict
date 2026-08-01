import type { LedgerEntry } from "../contracts";

/**
 * THE SIGNED RECORD — and the one detail in this milestone that must not be
 * simplified.
 *
 * ---------------------------------------------------------------------------
 * SIGN WHAT THE READER RECONSTRUCTS, NOT WHAT THE WRITER PERSISTS.
 *
 * `write.ts` persists Date objects and Prisma JSON values. `read.ts` projects
 * those back into the LedgerEntry CONTRACT — ISO strings, plain objects,
 * explicit nulls. The two shapes are not the same.
 *
 * If a signature were taken over the writer's shape and verified against the
 * reader's, every verification would fail — and it would fail intermittently
 * enough to look like a key problem rather than a serialization problem.
 *
 * So the writer builds the contract projection FIRST, signs that, and persists
 * both. Verification, export, and the offline verifier all operate on the same
 * projection. There is exactly one signed shape in this system and this file
 * defines it.
 * ---------------------------------------------------------------------------
 */

/** Everything on a ledger entry except the receipt. A signature cannot cover itself. */
export type SignedRecord = Omit<LedgerEntry, "receipt">;

/**
 * Strips the receipt and normalizes through JSON.
 *
 * The JSON round trip is not defensive tidiness — it is what makes the writer's
 * in-memory object byte-identical to the object the database will hand back.
 * `undefined` disappears the same way Prisma's JSON columns drop it, and
 * nothing survives that canonicalization would reject.
 */
export function toSignedRecord(entry: LedgerEntry): SignedRecord {
  const { receipt: _receipt, ...record } = entry;
  return JSON.parse(JSON.stringify(record)) as SignedRecord;
}

/**
 * The chain's canonical ordering, expressed once so the writer and every reader
 * agree on what "the previous entry" means.
 *
 * `createdAt` is wall clock at millisecond precision, so a tie is possible in a
 * fast loop; `id` breaks it deterministically. Both sides sort the same way or
 * the chain does not reconstruct.
 */
export const CHAIN_ORDER = [
  { createdAt: "asc" },
  { id: "asc" },
] as const;
