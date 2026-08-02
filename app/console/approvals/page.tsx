import { listApprovals, expireStaleApprovals } from "@/lib/outcome/approvals";
import { getClock } from "@/lib/clock";
import { formatCents } from "@/lib/contracts/money";
import type { Cents, EvidenceBundle, Proposal } from "@/lib/contracts";
import { PageHeader } from "@/app/_components/layout/page-header";
import { DbUnavailable } from "@/app/_components/feedback/alert";
import { EmptyState } from "@/app/_components/feedback/empty-state";
import { ModelOutput } from "@/app/_components/domain/model-output";
import {
  ApprovalStatusChip,
  NeedsPasskeyChip,
} from "@/app/_components/domain/chips";
import { ApprovalActions } from "@/app/_components/domain/approval-actions";
import { Badge } from "@/app/_components/ui/badge";

export const dynamic = "force-dynamic";

/**
 * Approvals — where human and agent meet.
 *
 * Each request carries the frozen snapshot it was raised under. The two types
 * are visually distinct because they are not interchangeable: one is permission
 * within existing authority, the other is a request for NEW authority that only
 * a passkey can grant — and only the second wears the loud chip.
 *
 * ---------------------------------------------------------------------------
 * FIXED INFORMATION ORDER
 *
 * Every card reads: STATUS → WHO → HOW MUCH → WHAT IT WOULD TAKE → THE AGENT'S
 * REASONING → WHAT APPROVING ACTUALLY DOES → THE CLOCK → THE DECISION. The
 * consequence is always stated in prose immediately above the buttons that
 * carry it out.
 * ---------------------------------------------------------------------------
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
    <>
      <PageHeader
        title="Approvals"
        question="Where did the agent stop and ask? Approving here satisfies policy — it never creates authority."
        actions={
          unavailable || pending.length === 0 ? null : (
            <Badge tone="medium">{pending.length} pending</Badge>
          )
        }
      />

      {unavailable ? (
        <DbUnavailable />
      ) : approvals.length === 0 ? (
        <EmptyState
          variant="no-data"
          title="Nothing waiting on you"
          description="Every proposal the agent has made was either within its authority or refused outright. Nothing is being held for a decision."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {approvals.map((approval) => {
            const proposal = approval.proposalSnapshot as Proposal | null;
            const evidence = approval.evidenceSnapshot as EvidenceBundle | null;
            const ceiling = approval.type === "CEILING_RAISE";

            return (
              <li
                key={approval.id}
                className="border-border bg-card rounded-lg border p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <ApprovalStatusChip status={approval.status} />
                  <span className="text-card-title text-foreground">
                    {evidence?.vendorName ?? approval.vendorId}
                  </span>
                  <span className="text-body text-text-muted tabular-nums">
                    {formatCents(approval.amountCents as Cents)}
                  </span>
                  {ceiling ? <NeedsPasskeyChip /> : null}
                </div>

                {proposal ? (
                  <ModelOutput className="mt-3">{proposal.rationale}</ModelOutput>
                ) : null}

                <p className="text-body text-text-muted mt-3">
                  {ceiling
                    ? "Exceeds the mandate ceiling. Approving here records intent; the ceiling moves only after a passkey ceremony."
                    : "Within existing mandate authority. Approving permits this one charge."}
                </p>

                <p className="text-meta text-text-subtle mt-1.5 tabular-nums">
                  expires {approval.expiresAt.toISOString().slice(0, 16)}Z
                  {approval.passkeyAt
                    ? ` · passkey ${approval.passkeyAt.toISOString().slice(0, 16)}Z`
                    : ""}
                </p>

                {approval.status === "PENDING" ? (
                  <div className="mt-4">
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
    </>
  );
}
