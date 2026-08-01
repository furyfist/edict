import Link from "next/link";
import { notFound } from "next/navigation";
import { getExplained } from "@/lib/ledger";
import { LedgerRow } from "../../components/LedgerRow";
import { DbError, Panel, PageHeader } from "../../components/ui";

export const dynamic = "force-dynamic";

/**
 * One entry, fully expanded.
 *
 * The attribution chain and the Prava identifiers are the point of this page:
 * a judge should be able to take the mandate id and the charge id from here,
 * open Prava's own dashboard, and find the same transaction. That cross-check
 * is the strongest credibility moment the demo has, and it only works if the
 * identifiers are prominent rather than buried.
 */
export default async function LedgerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let item;
  try {
    item = await getExplained(id);
  } catch {
    return (
      <>
        <PageHeader title="Ledger entry" question="What happened here?" />
        <DbError />
      </>
    );
  }

  if (!item) notFound();

  return (
    <>
      <PageHeader
        title="Ledger entry"
        question="Who decided, who authorized, who executed, who recorded?"
      >
        <Link href="/ledger" style={{ color: "var(--accent)", fontSize: 13 }}>
          ← Back to ledger
        </Link>
      </PageHeader>

      <Panel padded={false}>
        <LedgerRow item={item} expanded />
      </Panel>

      <Panel>
        <h2 style={{ fontSize: 13, marginBottom: 8 }}>Verify independently</h2>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
          {item.entry.prava.chargeId
            ? "The charge and mandate identifiers above resolve in Prava's own dashboard. Nothing about this record depends on trusting this application."
            : "No charge identifier, because no charge was made. The mandate this would have run against is named above."}
        </p>
      </Panel>
    </>
  );
}
