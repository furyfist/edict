import { db } from "@/lib/db/client";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { addDays, daysBetween, getClock, startOfDay } from "@/lib/clock";
import { DbUnavailable, PageHeader } from "../_components/page-header";

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

  return (
    <section>
      <PageHeader
        title="Vendors"
        question="The evidence behind every decision. Unknown usage is shown as unknown — it is not the same as nobody using it."
      />

      {unavailable ? (
        <DbUnavailable />
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          No vendors. Run <code className="text-neutral-300">npm run seed</code>.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[46rem] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-[10px] uppercase tracking-wide text-neutral-500">
                <th className="py-2 font-medium">Vendor</th>
                <th className="py-2 font-medium">Seats active</th>
                <th className="py-2 font-medium">Renewal</th>
                <th className="py-2 font-medium">Due</th>
                <th className="py-2 font-medium">Authority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/80">
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="py-2.5">
                    <span className="text-neutral-100">{row.name}</span>
                    <span className="ml-2 text-xs text-neutral-600">
                      {row.category}
                    </span>
                    {row.injectedMessages > 0 ? (
                      <span className="ml-2 rounded border border-amber-500/30 px-1 py-0.5 text-[10px] text-amber-300">
                        {row.injectedMessages} injected
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 text-neutral-300">
                    {row.seatsActive === null ? (
                      <span className="text-amber-300/80">unknown</span>
                    ) : (
                      `${row.seatsActive}/${row.seatsAssigned}`
                    )}
                  </td>
                  <td className="py-2.5 text-neutral-300">
                    {row.amountCents === null
                      ? "—"
                      : formatCents(row.amountCents as Cents)}
                  </td>
                  <td className="py-2.5 text-neutral-400">
                    {row.dueInDays === null ? (
                      "—"
                    ) : row.dueInDays < 0 ? (
                      // A due date behind the demo clock is a real state, not a
                      // rendering slip: the cycle was adjudicated and the clock
                      // has since moved on. "-27d" in a column headed Due reads
                      // as a bug at a glance, so say what it means and keep the
                      // magnitude.
                      <span className="text-amber-300/80">
                        past due {Math.abs(row.dueInDays)}d
                      </span>
                    ) : (
                      `${row.dueInDays}d`
                    )}
                  </td>
                  <td className="py-2.5">
                    {row.hasMandate ? (
                      <span className="text-xs text-emerald-300">mandated</span>
                    ) : (
                      <span className="text-xs text-amber-300">
                        outside authority
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
