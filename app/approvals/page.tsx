import { listApprovals, expireStaleApprovals } from "@/lib/outcome/approvals";
import { getClock } from "@/lib/clock";
import { formatCents } from "@/lib/contracts/money";
import type { Cents, EvidenceBundle, Proposal } from "@/lib/contracts";
import { DbUnavailable, PageHeader } from "../_components/page-header";
import { ApprovalActions } from "../_components/approval-actions";

export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<string, string> = {
  PENDING: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  APPROVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  REJECTED: "border-neutral-600 bg-neutral-800 text-neutral-300",
  EXPIRED: "border-amber-500/30 bg-amber-500/10 text-amber-300",
};

/**
 * Approvals — where human and agent meet.
 *
 * Each request carries the frozen snapshot it was raised under. The two types
 * are visually distinct because they are not interchangeable: one is permission
 * within existing authority, the other is a request for new authority that only
 * a passkey can grant.
 */
export default async function ApprovalsPage() {
  let approvals: Array<{
    id: string;
    type: string;
    status: string;
    vendorId: string;
    amountCents: number;
    ruleId: string;
    expiresAt: Date;
    passkeyAt: Date | null;
    proposalSnapshot: unknown;
    evidenceSnapshot: unknown;
  }> = [];
  let unavailable = false;

  try {
    const clock = await getClock();
    await expireStaleApprovals(clock);
    approvals = (await listApprovals()) as typeof approvals;
  } catch {
    unavailable = true;
  }

  const pending = approvals.filter((a) => a.status === "PENDING");

  return (
    <section>
      <PageHeader
        title="Approvals"
        question="Where the agent stopped and asked. Approving in this app satisfies policy — it never creates authority."
        right={
          unavailable ? null : (
            <p className="text-xs text-neutral-500">{pending.length} pending</p>
          )
        }
      />

      {unavailable ? (
        <DbUnavailable />
      ) : approvals.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          Nothing waiting on you.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {approvals.map((approval) => {
            const proposal = approval.proposalSnapshot as Proposal | null;
            const evidence = approval.evidenceSnapshot as EvidenceBundle | null;
            const ceiling = approval.type === "CEILING_RAISE";

            return (
              <li
                key={approval.id}
                className="rounded border border-neutral-800 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                      STATUS_STYLE[approval.status] ?? "border-neutral-700"
                    }`}
                  >
                    {approval.status.toLowerCase()}
                  </span>
                  <span className="text-sm text-neutral-100">
                    {evidence?.vendorName ?? approval.vendorId}
                  </span>
                  <span className="text-sm text-neutral-400">
                    {formatCents(approval.amountCents as Cents)}
                  </span>
                  {ceiling ? (
                    <span className="rounded border border-amber-500/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300">
                      needs passkey
                    </span>
                  ) : null}
                </div>

                {proposal ? (
                  <div className="mt-3 rounded border border-dashed border-neutral-700 p-2.5">
                    <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
                      agent&apos;s stated reasoning — model output
                    </p>
                    <p className="text-xs text-neutral-300">
                      {proposal.rationale}
                    </p>
                  </div>
                ) : null}

                <p className="mt-3 text-xs text-neutral-500">
                  {ceiling
                    ? "Exceeds the mandate ceiling. Approving here records intent; the ceiling moves only after a passkey ceremony."
                    : "Within existing mandate authority. Approving permits this one charge."}
                </p>

                <p className="mt-1 text-xs text-neutral-600">
                  expires {approval.expiresAt.toISOString().slice(0, 16)}Z
                  {approval.passkeyAt
                    ? ` · passkey ${approval.passkeyAt.toISOString().slice(0, 16)}Z`
                    : ""}
                </p>

                {approval.status === "PENDING" ? (
                  <div className="mt-3">
                    <ApprovalActions
                      id={approval.id}
                      type={approval.type as "POLICY_EXCEPTION" | "CEILING_RAISE"}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
