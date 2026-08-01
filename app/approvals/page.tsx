import { formatMoney } from "@/lib/contracts";
import {
  listHistoricalApprovals,
  listPendingApprovals,
} from "@/lib/approvals";
import { requiresPasskeyCeremony } from "@/lib/approvals/ceiling";
import { ApprovalActions } from "../components/ApprovalActions";
import { DbError, Empty, Panel, PageHeader } from "../components/ui";

export const dynamic = "force-dynamic";

/**
 * Approvals — where a human meets the agent.
 *
 * Each pending request shows the frozen snapshot it was raised against, not
 * current data. That is deliberate and it is the honest thing to show: consent
 * is being given to act on specific evidence, so the evidence a person is
 * looking at must be the evidence the decision will be made on. Refreshing it
 * live would mean approving one situation and charging in another.
 */
export default async function ApprovalsPage() {
  let pending;
  let history;

  try {
    [pending, history] = await Promise.all([
      listPendingApprovals(),
      listHistoricalApprovals(25),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Approvals" question="What needs a human?" />
        <DbError />
      </>
    );
  }

  const withCeremonyFlag = await Promise.all(
    pending.map(async (approval) => ({
      approval,
      requiresPasskey: await requiresPasskeyCeremony(approval.id),
    })),
  );

  return (
    <>
      <PageHeader
        title="Approvals"
        question="What is waiting for a human decision?"
      />

      <Panel padded={false}>
        <h2
          style={{
            fontSize: 12,
            color: "var(--muted)",
            padding: "16px 16px 10px",
            margin: 0,
          }}
        >
          PENDING
        </h2>

        {withCeremonyFlag.length === 0 ? (
          <Empty>Nothing is waiting on a human.</Empty>
        ) : (
          withCeremonyFlag.map(({ approval, requiresPasskey }) => (
            <div
              key={approval.id}
              style={{
                padding: "14px 16px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "baseline",
                  flexWrap: "wrap",
                }}
              >
                <strong style={{ fontSize: 14 }}>
                  {approval.evidence.vendor.name}
                </strong>
                <span className="mono" style={{ fontSize: 13 }}>
                  {formatMoney({
                    cents: approval.amountCents,
                    currency: "USD",
                  })}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: requiresPasskey ? "var(--escalate)" : "var(--muted)",
                    border: `1px solid ${requiresPasskey ? "var(--escalate)" : "var(--border)"}`,
                    borderRadius: 3,
                    padding: "1px 6px",
                  }}
                >
                  {requiresPasskey ? "CEILING RAISE" : "POLICY EXCEPTION"}
                </span>
                <span
                  className="mono"
                  style={{
                    marginLeft: "auto",
                    fontSize: 11,
                    color: approval.expired
                      ? "var(--deny)"
                      : approval.hoursRemaining <= 4
                        ? "var(--escalate)"
                        : "var(--muted)",
                  }}
                >
                  {approval.expired
                    ? "expired"
                    : `expires in ${approval.hoursRemaining}h`}
                </span>
              </div>

              <p style={{ margin: "8px 0 0", fontSize: 13 }}>
                {approval.verdict.citedRuleDescription}
              </p>

              {approval.verdict.citedSourceFragment ? (
                <blockquote
                  style={{
                    margin: "6px 0 0",
                    paddingLeft: 10,
                    borderLeft: "2px solid var(--border)",
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--muted)",
                  }}
                >
                  “{approval.verdict.citedSourceFragment}”
                </blockquote>
              ) : null}

              {/* The frozen snapshot. Not refreshed. */}
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: "var(--panel-2)",
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <div style={{ color: "var(--muted)", marginBottom: 4 }}>
                  EVIDENCE AS IT STOOD WHEN THIS WAS RAISED — frozen, not live
                </div>
                <span className="mono">
                  {approval.evidence.seats
                    ? `${approval.evidence.seats.active} of ${approval.evidence.seats.licensed} seats active`
                    : "no usage data"}
                </span>
                {approval.evidence.priceChange ? (
                  <span className="mono" style={{ marginLeft: 12 }}>
                    {(
                      approval.evidence.priceChange.deltaBasisPoints / 100
                    ).toFixed(1)}
                    % price change
                  </span>
                ) : null}
                {approval.evidence.gaps.length > 0 ? (
                  <span
                    className="mono"
                    style={{ marginLeft: 12, color: "var(--escalate)" }}
                  >
                    gaps: {approval.evidence.gaps.join(", ")}
                  </span>
                ) : null}
              </div>

              <ApprovalActions
                approvalId={approval.id}
                requiresPasskey={requiresPasskey}
                amountCents={approval.amountCents}
                expired={approval.expired}
              />
            </div>
          ))
        )}
      </Panel>

      {history.length > 0 ? (
        <Panel padded={false}>
          <h2
            style={{
              fontSize: 12,
              color: "var(--muted)",
              padding: "16px 16px 10px",
              margin: 0,
            }}
          >
            RESOLVED
          </h2>
          {history.map((row) => (
            <div
              key={row.id}
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: 12,
                alignItems: "baseline",
                fontSize: 13,
                flexWrap: "wrap",
              }}
            >
              <span>{row.vendorId}</span>
              <span className="mono">
                {formatMoney({ cents: row.amountCents, currency: "USD" })}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
                {row.status}
              </span>
              {row.grantedMandateId ? (
                <span
                  className="mono"
                  style={{ fontSize: 11, color: "var(--muted)" }}
                >
                  new mandate {row.grantedMandateId}
                </span>
              ) : null}
              <span
                style={{
                  marginLeft: "auto",
                  color: "var(--muted)",
                  fontSize: 12,
                }}
              >
                {row.resolvedBy ?? "—"}
              </span>
            </div>
          ))}
        </Panel>
      ) : null}
    </>
  );
}
