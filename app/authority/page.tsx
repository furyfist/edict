import { db } from "@/lib/db/client";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { getClock, daysBetween } from "@/lib/clock";
import { DbUnavailable, PageHeader } from "../_components/page-header";
import { KillSwitch } from "../_components/kill-switch";

export const dynamic = "force-dynamic";

/**
 * Authority — the leash, rendered.
 *
 * Remaining authority is shown as a physical, depleting quantity. This is the
 * highest-value pixel in the product: it turns an abstract security property
 * into something a viewer can see the size of. An agent with a visible ceiling
 * reads as safe in a way that no amount of prose achieves.
 */
export default async function AuthorityPage() {
  let mandates: Array<{
    vendorId: string;
    vendorName: string;
    pravaMandateId: string;
    status: string;
    capCents: number;
    remainingCents: number;
    expiresAt: Date | null;
  }> = [];
  let engaged = false;
  // Never defaulted to wall time. If the clock cannot be read there is nothing
  // to render against it anyway, and a silent fallback to real time would make
  // every "expires in" figure quietly wrong.
  let clock: Date | null = null;
  let unavailable = false;

  try {
    clock = await getClock();
    const state = await db.systemState.findUnique({ where: { id: "singleton" } });
    engaged = state?.killSwitchEngaged ?? false;

    const rows = await db.mandate.findMany({ orderBy: { createdAt: "asc" } });
    const vendors = await db.vendor.findMany({
      select: { id: true, name: true },
    });
    const nameOf = new Map(vendors.map((v) => [v.id, v.name]));

    mandates = rows.map((row) => ({
      vendorId: row.vendorId,
      vendorName: nameOf.get(row.vendorId) ?? row.vendorId,
      pravaMandateId: row.pravaMandateId,
      status: row.status,
      capCents: row.capCents,
      remainingCents: row.remainingCents,
      expiresAt: row.expiresAt,
    }));
  } catch {
    unavailable = true;
  }

  return (
    <section>
      <PageHeader
        title="Authority"
        question="How much rope the agent has left. The amount ceiling is enforced in the tokenized credential — not by this application."
      />

      {unavailable ? (
        <DbUnavailable />
      ) : (
        <>
          <div className="mt-6">
            <KillSwitch engaged={engaged} />
          </div>

          {mandates.length === 0 ? (
            <p className="mt-6 text-sm text-neutral-500">
              No mandates yet. The agent has no authority at all.
            </p>
          ) : (
            <ul className="mt-6 space-y-4">
              {mandates.map((mandate) => {
                const spent = mandate.capCents - mandate.remainingCents;
                const pct =
                  mandate.capCents > 0
                    ? Math.max(
                        0,
                        Math.min(100, (mandate.remainingCents / mandate.capCents) * 100),
                      )
                    : 0;
                const daysLeft =
                  mandate.expiresAt && clock
                    ? daysBetween(clock, mandate.expiresAt)
                    : null;
                const active = mandate.status === "ACTIVE";

                return (
                  <li
                    key={mandate.vendorId}
                    className="rounded border border-neutral-800 p-4"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-neutral-100">
                        {mandate.vendorName}
                      </span>
                      <span
                        className={`text-[10px] uppercase tracking-wide ${
                          active ? "text-emerald-300" : "text-amber-300"
                        }`}
                      >
                        {mandate.status.toLowerCase()}
                      </span>
                    </div>

                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
                      <div
                        className={active ? "h-full bg-emerald-500/70" : "h-full bg-neutral-600"}
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
                      <span>
                        authorized{" "}
                        <span className="text-neutral-300">
                          {formatCents(mandate.capCents as Cents)}
                        </span>
                      </span>
                      <span>
                        spent{" "}
                        <span className="text-neutral-300">
                          {formatCents(spent as Cents)}
                        </span>
                      </span>
                      <span>
                        remaining{" "}
                        <span className="text-neutral-100">
                          {formatCents(mandate.remainingCents as Cents)}
                        </span>
                      </span>
                      {daysLeft !== null ? (
                        <span>
                          expires in{" "}
                          <span className="text-neutral-300">{daysLeft}d</span>
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-2 break-all font-mono text-[10px] text-neutral-600">
                      {mandate.pravaMandateId}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
