import {
  attributionLines,
  citationLine,
  evidenceChips,
  impactLine,
} from "../explain";
import type { LedgerEntry, Outcome } from "../contracts";
import type { ReceiptStatus } from "../attest";
import { verifiedChain } from "./read";

/**
 * Presentation of ledger entries.
 *
 * READ-SIDE ONLY. Nothing here can influence a decision or a charge — it runs
 * after the fact, on data already written, and the entry it decorates is
 * unchanged. That containment is why explanation work can never introduce a
 * correctness bug into the pipeline.
 *
 * Derived values are computed on every render and never stored. Stored
 * derivations drift from their inputs and produce two screens that disagree
 * mid-demo.
 */

export interface PresentedEntry {
  entry: LedgerEntry;
  /**
   * Verification state, recomputed on every read and never stored.
   *
   * A stored verification result would be a derived value that drifts from its
   * input — the exact failure the ledger exists to prevent. It is also the
   * reason the badge can flip the instant someone tampers with a row.
   */
  status: ReceiptStatus;
  display: {
    /** Exactly three. More and people stop reading. */
    chips: string[];
    impact: string;
    /** The user's own words. Null only when no rule was cited. */
    citation: string | null;
    attribution: Array<{ role: string; value: string }>;
    /**
     * Kept separate from `entry.explanation` so the interface can render it in
     * its own labeled region. A reader must always be able to tell which words
     * a language model wrote.
     */
    agentRationale: string | null;
  };
}

export function presentEntry(
  entry: LedgerEntry,
  status: ReceiptStatus = "UNATTESTED",
): PresentedEntry {
  return {
    entry,
    status,
    display: {
      chips: evidenceChips(entry),
      impact: impactLine(entry),
      citation: citationLine(entry),
      attribution: attributionLines(entry),
      agentRationale: entry.agentRationale,
    },
  };
}

/**
 * Reads the whole chain, then filters.
 *
 * Verification status only means something in chain order — an entry's link is
 * to its predecessor, not to the row above it in a filtered view. So the chain
 * is walked once, oldest first, and the filtering and reversing happen after.
 * At demo scale this is a single query over a few dozen rows.
 */
export async function listPresentedEntries(options: {
  outcome?: Outcome;
  vendorId?: string;
  limit?: number;
  /**
   * Defaults to operational.
   *
   * The home page is the five-second impression and it should show the agent's
   * work, not last night's attacks against it. The chain above is still walked
   * whole — only the display is filtered.
   */
  context?: "OPERATIONAL" | "ADVERSARIAL" | "ALL";
} = {}): Promise<PresentedEntry[]> {
  const chain = await verifiedChain();
  const context = options.context ?? "OPERATIONAL";

  const matching = chain.filter(({ entry, runContext }) => {
    if (context !== "ALL" && runContext !== context) return false;
    if (options.outcome && entry.outcome !== options.outcome) return false;
    if (options.vendorId && entry.vendorId !== options.vendorId) return false;
    return true;
  });

  return matching
    .reverse()
    .slice(0, options.limit ?? 100)
    .map(({ entry, status }) => presentEntry(entry, status));
}

export async function listPresentedRefusals(
  limit = 100,
): Promise<PresentedEntry[]> {
  return listPresentedEntries({ outcome: "REFUSED", limit });
}
