/**
 * The ledger.
 *
 * Append-only. This module exports `appendEntry` and `appendCorrection` and
 * exports no delete path at all. Nothing anywhere in the application removes a
 * ledger row.
 *
 * There is exactly one narrow exception to immutability, and it is documented
 * rather than hidden: `closeIntent` writes the network's answer onto a row that
 * was captured before the charge was attempted. It can only set the outcome and
 * the network identifiers, it refuses to touch a row that is not an open
 * intent, and it refuses to close the same row twice. Attribution, amount,
 * decision, and cited rule are written once at capture and never rewritten.
 *
 * The alternative — two rows per charge, one for intent and one for result —
 * was rejected because it makes every read path filter out half its rows, and
 * a ledger that needs a filter to be read correctly will eventually be read
 * incorrectly.
 */

export {
  appendEntry,
  appendCorrection,
  DuplicateEntryError,
  type WriteEntryInput,
} from "./write";

export {
  captureIntent,
  closeIntent,
  findOpenIntents,
  type CaptureIntentInput,
  type CloseIntentInput,
} from "./capture";

export {
  getEntry,
  hasEntryForCycle,
  listCorrections,
  listEntries,
  listRefusals,
  toLedgerEntry,
  totals,
  type LedgerTotals,
  type ListOptions,
} from "./query";

export {
  getExplained,
  listExplained,
  listExplainedRefusals,
  type ExplainedEntry,
} from "./explained";

export { AGENT, ENGINE, NETWORK, NOBODY, TICK, human } from "./actors";
