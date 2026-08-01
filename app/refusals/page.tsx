import { listPresentedRefusals } from "@/lib/ledger";
import type { PresentedEntry } from "@/lib/ledger";
import { EntryList } from "../_components/entry-list";
import { DbUnavailable, PageHeader } from "../_components/page-header";

export const dynamic = "force-dynamic";

/**
 * Refusals — what the agent would not do.
 *
 * This is the SAME ledger, filtered. One data model, two doors. Every product
 * shows what it did; showing restraint is the most trust-generating surface
 * available, and it is nearly free because the data already exists.
 */
export default async function RefusalsPage() {
  let entries: PresentedEntry[] = [];
  let unavailable = false;

  try {
    entries = await listPresentedRefusals(100);
  } catch {
    unavailable = true;
  }

  return (
    <section>
      <PageHeader
        title="Refusals"
        question="What the agent would not do. Each one names the rule that stopped it — and nothing was charged."
        right={
          unavailable ? null : (
            <p className="text-xs text-neutral-500">{entries.length} refused</p>
          )
        }
      />

      {unavailable ? <DbUnavailable /> : <EntryList entries={entries} />}
    </section>
  );
}
