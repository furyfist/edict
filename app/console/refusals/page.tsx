import { listPresentedRefusals } from "@/lib/ledger";
import type { PresentedEntry } from "@/lib/ledger";
import { EntryList } from "@/app/_components/domain/entry-list";
import { PageHeader } from "@/app/_components/layout/page-header";
import { DbUnavailable } from "@/app/_components/feedback/alert";
import { Badge } from "@/app/_components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Refusals — what the agent would not do.
 *
 * This is the SAME ledger, filtered. One data model, two doors. Every product
 * shows what it did; showing restraint is the most trust-generating surface
 * available, and it is nearly free because the data already exists.
 *
 * An empty list here is the good state and is written to reassure rather than
 * to apologise — nothing has been refused because nothing needed refusing.
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
    <>
      <PageHeader
        title="Refusals"
        question="What would the agent not do? Each one names the rule that stopped it — and nothing was charged."
        actions={
          unavailable || entries.length === 0 ? null : (
            <Badge tone="medium">{entries.length} refused</Badge>
          )
        }
      />

      {unavailable ? (
        <DbUnavailable />
      ) : (
        <EntryList
          entries={entries}
          emptyTitle="Nothing has been refused"
          emptyDescription="The agent has not met a proposal its policy forbids. This is the good state — an empty list here means everything it wanted to do, it was allowed to do."
        />
      )}
    </>
  );
}
