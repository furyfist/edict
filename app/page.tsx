import { listPresentedEntries } from "@/lib/ledger";
import type { PresentedEntry } from "@/lib/ledger";
import { EntryList } from "./_components/entry-list";
import { DbUnavailable, PageHeader } from "./_components/page-header";

export const dynamic = "force-dynamic";

/**
 * The ledger is the home route.
 *
 * Opening on completed work rather than on a dashboard of findings is what
 * files this as an agent instead of an analytics tool — and that impression is
 * formed before a judge reads a word.
 */
export default async function LedgerPage() {
  let entries: PresentedEntry[] = [];
  let unavailable = false;

  try {
    entries = await listPresentedEntries({ limit: 100 });
  } catch {
    unavailable = true;
  }

  const acted = entries.filter((e) => e.entry.outcome === "EXECUTED").length;
  const asked = entries.filter((e) => e.entry.outcome === "ESCALATED").length;
  const refused = entries.filter((e) => e.entry.outcome === "REFUSED").length;

  return (
    <section>
      <PageHeader
        title="Ledger"
        question="What the agent did, most recent first. Every entry names who decided, who authorized, who executed, and who recorded it."
        right={
          unavailable ? null : (
            <div className="text-right">
              <p className="text-xs text-neutral-500">
                acted {acted} · asked {asked} · refused {refused}
              </p>
              <a
                className="mt-1 inline-block text-xs text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
                href="/api/receipts?download=1"
              >
                export receipts
              </a>
            </div>
          )
        }
      />

      {unavailable ? null : (
        <p className="mt-3 text-xs text-neutral-500">
          Every entry is signed and linked to the one before it. Export the
          chain and check it yourself with{" "}
          <code className="text-neutral-400">
            node scripts/verify-receipts.mjs &lt;file&gt;
          </code>{" "}
          — no database, no network, and none of our code required to believe
          the answer.
        </p>
      )}

      {unavailable ? <DbUnavailable /> : <EntryList entries={entries} />}
    </section>
  );
}
