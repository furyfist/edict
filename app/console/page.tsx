import { Download } from "lucide-react";
import { listPresentedEntries } from "@/lib/ledger";
import type { PresentedEntry } from "@/lib/ledger";
import { EntryList } from "@/app/_components/domain/entry-list";
import { PageHeader } from "@/app/_components/layout/page-header";
import { PageSections, Section } from "@/app/_components/layout/section";
import { StatGrid, StatTile } from "@/app/_components/layout/stat-tile";
import { DbUnavailable } from "@/app/_components/feedback/alert";
import { ButtonLink } from "@/app/_components/ui/button";

export const dynamic = "force-dynamic";

/**
 * The ledger is the console's home route.
 *
 * Opening on completed work rather than on a dashboard of findings is what
 * files this as an agent instead of an analytics tool — and that impression is
 * formed before a reader takes in a word.
 *
 * The three tiles are toned by the rule the rest of the product uses: neutral
 * unless there is something to act on. A run in which the agent acted fourteen
 * times and refused nothing is achromatic, which is exactly what makes a single
 * coloured number impossible to miss when one appears.
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
    <>
      <PageHeader
        title="Ledger"
        question="What did the agent do? Every entry names who decided, who authorized, who executed, and who recorded it."
        actions={
          unavailable ? null : (
            <ButtonLink
              variant="outline"
              size="sm"
              href="/api/receipts?download=1"
            >
              <Download aria-hidden />
              Export receipts
            </ButtonLink>
          )
        }
      />

      {unavailable ? (
        <DbUnavailable />
      ) : (
        <PageSections>
          <StatGrid className="sm:grid-cols-3">
            <StatTile label="Acted" value={acted} />
            <StatTile
              label="Asked"
              value={asked}
              tone={asked ? "info" : "neutral"}
              caption={asked ? "waiting on a human" : undefined}
            />
            <StatTile
              label="Refused"
              value={refused}
              tone={refused ? "medium" : "neutral"}
              caption={refused ? "and nothing was charged" : undefined}
            />
          </StatGrid>

          <Section
            title="Every entry"
            description={
              <>
                Signed and linked to the one before it. Export the chain and
                check it yourself with{" "}
                <code className="text-mono text-foreground">
                  node scripts/verify-receipts.mjs &lt;file&gt;
                </code>{" "}
                — no database, no network, and none of our code required to
                believe the answer.
              </>
            }
          >
            <EntryList
              entries={entries}
              emptyTitle="Nothing recorded yet"
              emptyDescription="The agent has not acted. Run a tick from the Attack console to watch it work, or wait for the overnight run."
            />
          </Section>
        </PageSections>
      )}
    </>
  );
}
