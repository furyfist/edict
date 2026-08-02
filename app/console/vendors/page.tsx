import { db } from "@/lib/db/client";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { addDays, daysBetween, getClock, startOfDay } from "@/lib/clock";
import { PageHeader } from "@/app/_components/layout/page-header";
import { PageSections } from "@/app/_components/layout/section";
import { StatGrid, StatTile } from "@/app/_components/layout/stat-tile";
import { DbUnavailable } from "@/app/_components/feedback/alert";
import { EmptyState } from "@/app/_components/feedback/empty-state";
import { Badge } from "@/app/_components/ui/badge";
import { Unknown } from "@/app/_components/layout/key-value-grid";
import {
  TableFrame,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/app/_components/data/table";

export const dynamic = "force-dynamic";

interface VendorRow {
  id: string;
  name: string;
  category: string;
  seatsAssigned: number;
  seatsActive: number | null;
  amountCents: number | null;
  dueInDays: number | null;
  hasMandate: boolean;
  injectedMessages: number;
}

/**
 * Vendors — the evidence behind every decision.
 *
 * This is where a judge goes to verify a claim the ledger made. Unknown usage
 * is shown as unknown, never as zero: a vendor with no usage data is a
 * different situation from one nobody uses, and the engine treats them
 * differently, so the interface must too.
 */
export default async function VendorsPage() {
  let rows: VendorRow[] = [];
  let unavailable = false;

  try {
    const clock = await getClock();
    const since = addDays(clock, -30);

    // ------------------------------------------------------------------
    // SEVEN QUERIES, ONE WAVE — not five per vendor.
    //
    // This page used to issue about forty small queries: five for each of the
    // eight vendors, one of them sequential after the others. Against a remote
    // database behind a connection pool they queue into waves, and the page
    // took ~10s. Raising the pool to 20 halved that; grouping the reads is
    // what removes the rest.
    //
    // Every query below is vendor-agnostic and they all run concurrently. The
    // per-vendor assembly happens in memory afterwards, where it is free.
    //
    // Aggregate rows are absent rather than zero for vendors with no matching
    // records, which is exactly the distinction this page exists to preserve:
    // a vendor with no usage rows is unknown, not idle.
    // ------------------------------------------------------------------
    const [
      vendors,
      mandates,
      seatCounts,
      activeSeatPairs,
      usageCounts,
      renewals,
      injectedCounts,
    ] = await Promise.all([
      db.vendor.findMany({ orderBy: { name: "asc" } }),
      db.mandate.findMany({ select: { vendorId: true } }),
      db.seat.groupBy({ by: ["vendorId"], _count: { _all: true } }),
      // Distinct (vendor, seat) pairs that logged in inside the window. At most
      // one row per seat, so this stays small however long the window is.
      db.usageRecord.findMany({
        where: {
          loggedIn: true,
          day: { gte: startOfDay(since), lte: clock },
        },
        select: { vendorId: true, seatId: true },
        distinct: ["vendorId", "seatId"],
      }),
      db.usageRecord.groupBy({ by: ["vendorId"], _count: { _all: true } }),
      // The CURRENT cycle per vendor: the most recent one that has actually
      // started. Ordered so the first row seen per vendor is that cycle.
      //
      // `cycleStart <= clock` is doing two jobs. It excludes cycles that have
      // not begun — CloudSync Pro carries reserved cycles 30, 60 and 90 days
      // out for the injection beat, and none of them is what the vendor is
      // paying today. And it keeps this page's definition of "current" the
      // same as the tick runner's, which also selects the latest cycle per
      // vendor rather than the earliest.
      //
      // Ordering by due date instead, with no floor, returned the OLDEST
      // seeded cycle: Notion showed $4,200 due -27d while the ledger beside it
      // said $4,800. Two screens disagreeing about the same vendor is the one
      // thing this page cannot afford, because it is where a judge goes to
      // check a claim the ledger made.
      db.renewal.findMany({
        where: { cycleStart: { lte: clock } },
        orderBy: { cycleStart: "desc" },
        select: { vendorId: true, amountCents: true, dueDate: true },
      }),
      db.inboundMessage.groupBy({
        by: ["vendorId"],
        where: { injected: true },
        _count: { _all: true },
      }),
    ]);

    const withMandate = new Set(mandates.map((m) => m.vendorId));
    const seatsByVendor = new Map(
      seatCounts.map((row) => [row.vendorId, row._count._all]),
    );
    const usageRowsByVendor = new Map(
      usageCounts.map((row) => [row.vendorId, row._count._all]),
    );
    const injectedByVendor = new Map(
      injectedCounts.map((row) => [row.vendorId, row._count._all]),
    );

    const activeByVendor = new Map<string, number>();
    for (const pair of activeSeatPairs) {
      activeByVendor.set(pair.vendorId, (activeByVendor.get(pair.vendorId) ?? 0) + 1);
    }

    // Renewals arrive newest cycle first, so the first row seen per vendor is
    // that vendor's current cycle.
    const renewalByVendor = new Map<string, (typeof renewals)[number]>();
    for (const renewal of renewals) {
      if (!renewalByVendor.has(renewal.vendorId)) {
        renewalByVendor.set(renewal.vendorId, renewal);
      }
    }

    rows = vendors.map((vendor) => {
      const renewal = renewalByVendor.get(vendor.id);
      const hasAnyUsage = (usageRowsByVendor.get(vendor.id) ?? 0) > 0;

      return {
        id: vendor.id,
        name: vendor.name,
        category: vendor.category,
        seatsAssigned: seatsByVendor.get(vendor.id) ?? 0,
        // Absent data stays absent. Zero would be a claim we cannot make.
        seatsActive: hasAnyUsage ? (activeByVendor.get(vendor.id) ?? 0) : null,
        amountCents: renewal?.amountCents ?? null,
        dueInDays: renewal ? daysBetween(clock, renewal.dueDate) : null,
        hasMandate: withMandate.has(vendor.id),
        injectedMessages: injectedByVendor.get(vendor.id) ?? 0,
      };
    });
  } catch {
    unavailable = true;
  }

  // The page's own question, answered above the table. `usageUnknown` is the
  // one that matters most here: it is the count of vendors the engine cannot
  // reason about, and it is the distinction this whole page exists to preserve.
  const underMandate = rows.filter((r) => r.hasMandate).length;
  const usageUnknown = rows.filter((r) => r.seatsActive === null).length;
  const upcoming = rows.filter(
    (r) => r.dueInDays !== null && r.dueInDays >= 0,
  ).length;

  return (
    <>
      <PageHeader
        title="Vendors"
        question="What is the evidence behind a decision? Unknown usage is shown as unknown — it is not the same as nobody using it."
      />

      {unavailable ? (
        <DbUnavailable />
      ) : (
        <PageSections>
          {rows.length > 0 ? (
            <StatGrid>
              <StatTile label="Vendors" value={rows.length} />
              <StatTile
                label="Under mandate"
                value={`${underMandate}/${rows.length}`}
                tone={underMandate < rows.length ? "warn" : "neutral"}
                caption={
                  underMandate < rows.length
                    ? `${rows.length - underMandate} outside authority`
                    : undefined
                }
              />
              <StatTile
                label="Usage unknown"
                value={usageUnknown}
                tone={usageUnknown ? "medium" : "neutral"}
                caption={usageUnknown ? "evidence incomplete" : undefined}
              />
              <StatTile
                label="Renewals ahead"
                value={upcoming}
                tone={upcoming ? "medium" : "neutral"}
                caption={upcoming ? "still to be decided" : "none pending"}
              />
            </StatGrid>
          ) : null}

          <TableFrame
          isEmpty={rows.length === 0}
          empty={
            <EmptyState
              variant="no-data"
              title="No vendors"
              description="The demo dataset has not been loaded. Run npm run seed — it is deterministic and idempotent."
            />
          }
        >
          <THead>
            <TH>Vendor</TH>
            <TH>Seats active</TH>
            <TH>Renewal</TH>
            <TH>Due</TH>
            <TH>Authority</TH>
          </THead>
          <TBody>
            {rows.map((row) => (
              <TR key={row.id}>
                <TD>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body-strong text-foreground">
                      {row.name}
                    </span>
                    <span className="text-meta text-text-subtle">
                      {row.category}
                    </span>
                    {row.injectedMessages > 0 ? (
                      <Badge tone="medium">
                        {row.injectedMessages} injected
                      </Badge>
                    ) : null}
                  </div>
                </TD>

                {/* Absent data stays absent. Zero seats active and no usage
                    data at all are different situations, the engine treats
                    them differently, and so must this column. */}
                <TD className="tabular-nums">
                  {row.seatsActive === null ? (
                    <span
                      className="text-warn"
                      title="No usage records exist for this vendor. That is not the same as nobody using it."
                    >
                      unknown
                    </span>
                  ) : (
                    `${row.seatsActive}/${row.seatsAssigned}`
                  )}
                </TD>

                <TD className="tabular-nums">
                  {row.amountCents === null ? (
                    <Unknown title="No renewal cycle has started for this vendor." />
                  ) : (
                    formatCents(row.amountCents as Cents)
                  )}
                </TD>

                <TD className="tabular-nums">
                  {row.dueInDays === null ? (
                    <Unknown title="No renewal cycle has started for this vendor." />
                  ) : row.dueInDays < 0 ? (
                    // A due date behind the demo clock is a real state, not a
                    // rendering slip: the cycle was adjudicated and the clock
                    // has since moved on. Say what it means and keep the
                    // magnitude — but do NOT tint it.
                    //
                    // Seven of eight vendors sit in this state, and a colour
                    // worn by the majority has stopped being a signal. The
                    // words carry the fact; the tint is spent below, on the one
                    // row where something is about to happen.
                    <span
                      className="text-text-muted"
                      title="Already adjudicated — the demo clock has since moved past this due date."
                    >
                      past due {Math.abs(row.dueInDays)}d
                    </span>
                  ) : row.dueInDays <= 7 ? (
                    <span
                      className="text-warn"
                      title="Due within the week — the agent will act on this renewal next."
                    >
                      {row.dueInDays}d
                    </span>
                  ) : (
                    `${row.dueInDays}d`
                  )}
                </TD>

                <TD>
                  {row.hasMandate ? (
                    <Badge tone="success">mandated</Badge>
                  ) : (
                    <Badge tone="medium">outside authority</Badge>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
          </TableFrame>
        </PageSections>
      )}
    </>
  );
}
