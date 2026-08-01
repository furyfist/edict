import type { LedgerEntry } from "../contracts";
import { explain, type Explanation } from "../explain";
import { getEntry, listEntries, listRefusals, type ListOptions } from "./query";

/**
 * The explained read path.
 *
 * This module is deliberately read-side only. It imports `lib/explain` and the
 * ledger's query functions, and it imports nothing that writes. The reason is
 * structural rather than stylistic: if the explainer were reachable from the
 * write path, a change to how a decision is *described* could change what is
 * *recorded*, and the ledger would stop being an independent account of what
 * happened.
 *
 * Pages read from here. The tick runner does not.
 */

export interface ExplainedEntry {
  entry: LedgerEntry;
  explanation: Explanation;
  /**
   * Model prose, separated from the rendered explanation so the UI can label
   * it as such. A reader must always be able to tell a verified fact from a
   * plausible sentence, and that distinction is easiest to hold when the two
   * arrive in different fields.
   */
  agentProse: {
    rationale: string | null;
    rejectedAlternative: string | null;
  };
}

function attach(entry: LedgerEntry): ExplainedEntry {
  return {
    entry,
    explanation: explain(entry),
    agentProse: {
      rationale: entry.agentRationale,
      rejectedAlternative: entry.agentRejectedAlternative,
    },
  };
}

export async function listExplained(
  options: ListOptions = {},
): Promise<ExplainedEntry[]> {
  const entries = await listEntries(options);
  return entries.map(attach);
}

/** The refusal view, explained. Still one filter over one model. */
export async function listExplainedRefusals(
  limit = 100,
): Promise<ExplainedEntry[]> {
  const entries = await listRefusals(limit);
  return entries.map(attach);
}

export async function getExplained(
  id: string,
): Promise<ExplainedEntry | null> {
  const entry = await getEntry(id);
  return entry ? attach(entry) : null;
}
