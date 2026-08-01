/**
 * The ledger — the product's second noun.
 *
 * Exactly one mutating export: `appendEntry`. No update, no delete. If you find
 * yourself wanting either, you want a new entry with `correctsEntryId` instead.
 */

export { appendEntry } from "./write";
export type { LedgerDraft, LedgerCompletion } from "./write";

export {
  listEntries,
  listRefusals,
  getEntry,
  hasEntryForCycle,
  countsByOutcome,
  verifiedChain,
  verifyEntry,
} from "./read";
export type { VerifiedEntry } from "./read";

export { toSignedRecord, CHAIN_ORDER } from "./record";
export type { SignedRecord } from "./record";

export {
  presentEntry,
  listPresentedEntries,
  listPresentedRefusals,
} from "./present";
export type { PresentedEntry } from "./present";
