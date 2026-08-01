import { formatMoney } from "@/lib/contracts";
import { listExplained, totals } from "@/lib/ledger";
import { LedgerRow } from "../components/LedgerRow";
import { DbError, Empty, Panel, PageHeader } from "../components/ui";

export const dynamic = "force-dynamic";

/**
 * The ledger — what has happened.
 *
 * The 5-second impression and the demo's home surface. Reverse-chronological,
 * completed actions and refusals together, because separating them would let a
 * reader believe the refusals were a different kind of event rather than the
 * same pipeline reaching a different answer.
 */
export default async function LedgerPage() {
  let items;
  let counts;

  try {
    [items, counts] = await Promise.all([listExplained({ limit: 100 }), totals()]);
  } catch {
    return (
      <>
        <PageHeader title="Ledger" question="What has happened?" />
        <DbError />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Ledger" question="What has happened?">
        <div style={{ display: "flex", gap: 20, fontSize: 12 }}>
          <div>
            <div style={{ color: "var(--muted)" }}>Spent</div>
            <div className="mono" style={{ fontSize: 15 }}>
              {formatMoney({ cents: counts.executedCents, currency: "USD" })}
            </div>
          </div>
          <div>
            <div style={{ color: "var(--muted)" }}>Refused</div>
            <div
              className="mono"
              style={{ fontSize: 15, color: "var(--deny)" }}
            >
              {formatMoney({ cents: counts.refusedCents, currency: "USD" })}
            </div>
          </div>
        </div>
      </PageHeader>

      <Panel padded={false}>
        {items.length === 0 ? (
          <Empty>
            Nothing has happened yet. Run a tick from the attack console.
          </Empty>
        ) : (
          items.map((item) => <LedgerRow key={item.entry.id} item={item} />)
        )}
      </Panel>
    </>
  );
}
