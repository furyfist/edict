import { db } from "@/lib/db/client";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { getClock, daysBetween } from "@/lib/clock";
import { PageHeader } from "@/app/_components/layout/page-header";
import { PageSections, Section } from "@/app/_components/layout/section";
import { StatGrid, StatTile } from "@/app/_components/layout/stat-tile";
import { DbUnavailable } from "@/app/_components/feedback/alert";
import { EmptyState } from "@/app/_components/feedback/empty-state";
import { MandateStatusChip } from "@/app/_components/domain/chips";
import { MonoId } from "@/app/_components/domain/mono";
import { KillSwitch } from "@/app/_components/domain/kill-switch";
import { BooksBalance } from "@/app/_components/domain/books-balance";
import { latestAttestation } from "@/lib/reconcile/attest";

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
  let attestation: Awaited<ReturnType<typeof latestAttestation>> = null;

  try {
    // One wave, not five. Every read here is independent, and stacking them
    // sequentially cost a second per page load against a remote database —
    // the same trap the Vendors page and the policy preview already fell into.
    //
    // `latestAttestation` READS, never runs. Reconciliation is a deliberate act
    // with a signed record attached; a page load must not manufacture one every
    // time somebody glances at this screen.
    const [clockValue, storedAttestation, state, rows, vendors] = await Promise.all([
      getClock(),
      latestAttestation(),
      db.systemState.findUnique({ where: { id: "singleton" } }),
      db.mandate.findMany({ orderBy: { createdAt: "asc" } }),
      db.vendor.findMany({ select: { id: true, name: true } }),
    ]);

    clock = clockValue;
    attestation = storedAttestation;
    engaged = state?.killSwitchEngaged ?? false;

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

  // ---------------------------------------------------------------------
  // The page's own question, answered in one line.
  //
  // The per-vendor bars below show the shape of the authority; they do not show
  // its SIZE. Answering "how much rope is left?" used to require summing three
  // cards by eye, on the one screen where the total is the whole point.
  // ---------------------------------------------------------------------
  const authorized = mandates.reduce((sum, m) => sum + m.capCents, 0);
  const remaining = mandates.reduce((sum, m) => sum + m.remainingCents, 0);
  const spent = authorized - remaining;
  const activeCount = mandates.filter((m) => m.status === "ACTIVE").length;
  const remainingPct = authorized > 0 ? (remaining / authorized) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Authority"
        question="How much rope does the agent have left? The amount ceiling is enforced in the tokenized credential — not by this application."
      />

      {unavailable ? (
        <DbUnavailable />
      ) : (
        <PageSections>
          {mandates.length > 0 ? (
            <StatGrid>
              <StatTile
                label="Authorized"
                value={formatCents(authorized as Cents)}
                caption={`across ${mandates.length} mandate${mandates.length === 1 ? "" : "s"}`}
              />
              <StatTile label="Spent" value={formatCents(spent as Cents)} />
              <StatTile
                label="Remaining"
                value={formatCents(remaining as Cents)}
                // Amber only when the leash is nearly out. A healthy ceiling is
                // achromatic, so a low one is the only coloured thing here.
                tone={remainingPct <= 20 ? "medium" : "neutral"}
                caption={`${Math.round(remainingPct)}% of the ceiling`}
              />
              <StatTile
                label="Active mandates"
                value={`${activeCount}/${mandates.length}`}
                tone={
                  engaged || activeCount < mandates.length ? "warn" : "neutral"
                }
                caption={engaged ? "halted by the kill switch" : undefined}
              />
            </StatGrid>
          ) : null}

          <Section
            title="Stop everything"
            description="One control, reachable from every page, that withdraws the agent's authority everywhere at once."
          >
            <KillSwitch engaged={engaged} />
          </Section>

          <Section
            title="Do the books balance?"
            description="Append-only proves nothing was altered. Only a two-sided reconciliation against the payment network's own record proves nothing was hidden."
          >
            <BooksBalance
              initial={
                attestation
                  ? {
                      ranAt: attestation.ranAt.toISOString(),
                      ledgerHead: attestation.ledgerHead,
                      attested: attestation.attested,
                      stale: attestation.stale,
                      subject: attestation.subject as never,
                    }
                  : null
              }
            />
          </Section>

          <Section
            title="The leash"
            description="Remaining authority as a physical, depleting quantity — one bar per vendor. The bar is the point: an agent whose ceiling you can see the size of reads as safe in a way no amount of prose achieves."
          >
            {mandates.length === 0 ? (
              <EmptyState
                variant="no-data"
                title="No mandates"
                description="The agent has no authority at all. Nothing it proposes can be executed until a mandate exists."
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {mandates.map((mandate) => {
                  const spent = mandate.capCents - mandate.remainingCents;
                  const pct =
                    mandate.capCents > 0
                      ? Math.max(
                          0,
                          Math.min(
                            100,
                            (mandate.remainingCents / mandate.capCents) * 100,
                          ),
                        )
                      : 0;
                  const daysLeft =
                    mandate.expiresAt && clock
                      ? daysBetween(clock, mandate.expiresAt)
                      : null;
                  const active = mandate.status === "ACTIVE";
                  // Amber below a fifth remaining. Colour marks the exception,
                  // so a healthy row stays green and a nearly-spent one is the
                  // only chromatic thing in the grid.
                  const low = active && pct <= 20;

                  return (
                    <li
                      key={mandate.vendorId}
                      className="border-border bg-card rounded-lg border p-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-card-title text-foreground">
                          {mandate.vendorName}
                        </span>
                        <MandateStatusChip status={mandate.status} />
                      </div>

                      <div
                        className="bg-surface-subtle mt-3 h-1.5 w-full overflow-hidden rounded-full"
                        role="img"
                        aria-label={`${Math.round(pct)}% of the authorized ceiling remains`}
                      >
                        <div
                          className={
                            !active
                              ? "bg-border-strong h-full rounded-full"
                              : low
                                ? "bg-risk-medium h-full rounded-full"
                                : "bg-risk-low h-full rounded-full"
                          }
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      <dl className="text-meta mt-3 flex flex-col gap-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-text-muted">remaining</dt>
                          <dd className="text-body-strong text-foreground tabular-nums">
                            {formatCents(mandate.remainingCents as Cents)}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-text-muted">spent</dt>
                          <dd className="text-text-muted tabular-nums">
                            {formatCents(spent as Cents)}
                          </dd>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                          <dt className="text-text-muted">authorized</dt>
                          <dd className="text-text-muted tabular-nums">
                            {formatCents(mandate.capCents as Cents)}
                          </dd>
                        </div>
                        {daysLeft !== null ? (
                          <div className="flex items-baseline justify-between gap-2">
                            <dt className="text-text-muted">expires in</dt>
                            <dd className="text-text-muted tabular-nums">
                              {daysLeft}d
                            </dd>
                          </div>
                        ) : null}
                      </dl>

                      <div className="border-border mt-3 border-t pt-3">
                        <MonoId
                          value={mandate.pravaMandateId}
                          label="mandate id"
                          truncate={22}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </PageSections>
      )}
    </>
  );
}
