import { formatMoney } from "@/lib/contracts";
import { listExplainedRefusals, totals } from "@/lib/ledger";
import { LedgerRow } from "../components/LedgerRow";
import { DbError, Empty, Panel, PageHeader } from "../components/ui";

export const dynamic = "force-dynamic";

/**
 * Refusals — what the agent was not allowed to do.
 *
 * This is a filter over the one ledger model, not a second model. That matters
 * beyond tidiness: two models could disagree, and the first time they did, the
 * ledger would stop being evidence of anything. Everything shown here is also
 * on the ledger page, and every entry here reached this view by having an
 * outcome in which no money moved.
 */
export default async function RefusalsPage() {
  let items;
  let counts;

  try {
    [items, counts] = await Promise.all([listExplainedRefusals(100), totals()]);
  } catch {
    return (
      <>
        <PageHeader title="Refusals" question="What was refused?" />
        <DbError />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Refusals"
        question="What was the agent not allowed to do?"
      >
        <div style={{ fontSize: 12, textAlign: "right" }}>
          <div style={{ color: "var(--muted)" }}>Not spent</div>
          <div className="mono" style={{ fontSize: 15, color: "var(--deny)" }}>
            {formatMoney({ cents: counts.refusedCents, currency: "USD" })}
          </div>
        </div>
      </PageHeader>

      <p
        style={{
          color: "var(--muted)",
          fontSize: 13,
          marginTop: 0,
          maxWidth: 640,
        }}
      >
        Every entry here is also on the ledger. This view is a filter over the
        same records — the outcomes in which nothing was charged.
      </p>

      <Panel padded={false}>
        {items.length === 0 ? (
          <Empty>Nothing has been refused yet.</Empty>
        ) : (
          items.map((item) => <LedgerRow key={item.entry.id} item={item} />)
        )}
      </Panel>
    </>
  );
}
