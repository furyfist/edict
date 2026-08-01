import { getClockState } from "@/lib/clock";
import { formatMoney } from "@/lib/contracts";
import { listMandateViews } from "@/lib/prava/mandates";
import { KillSwitch } from "../components/KillSwitch";
import { DbError, Empty, Panel, PageHeader, PravaId } from "../components/ui";

export const dynamic = "force-dynamic";

/**
 * Authority — what the agent can spend.
 *
 * This page renders the leash. The figure that matters is "remaining", shown
 * as a depleting quantity rather than a number in a table, because the point
 * being made is that the authority is finite and visibly running out.
 *
 * Every figure here is mirrored from Prava and refreshed at the top of each
 * tick. The ceiling is enforced in the tokenized credential itself — this page
 * reports it, and could not raise it even if the code tried.
 */
export default async function AuthorityPage() {
  let mandates;
  let clock;

  try {
    [mandates, clock] = await Promise.all([
      listMandateViews(),
      getClockState(),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Authority" question="What can the agent spend?" />
        <DbError />
      </>
    );
  }

  const totalAuthorized = mandates.reduce((sum, m) => sum + m.authorizedCents, 0);
  const totalRemaining = mandates.reduce((sum, m) => sum + m.remainingCents, 0);

  return (
    <>
      <PageHeader
        title="Authority"
        question="What can the agent spend, and how much is left?"
      >
        <div style={{ textAlign: "right", fontSize: 12 }}>
          <div style={{ color: "var(--muted)" }}>Remaining across all mandates</div>
          <div className="mono" style={{ fontSize: 18 }}>
            {formatMoney({ cents: totalRemaining, currency: "USD" })}
            <span style={{ color: "var(--muted)", fontSize: 12 }}>
              {" "}
              of {formatMoney({ cents: totalAuthorized, currency: "USD" })}
            </span>
          </div>
        </div>
      </PageHeader>

      <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 680, marginTop: 0 }}>
        These ceilings are enforced in the payment credential itself, by Prava.
        The policy engine is an earlier, separate gate. A charge above a ceiling
        is declined at the network whether or not the engine was consulted.
      </p>

      <Panel padded={false}>
        {mandates.length === 0 ? (
          <Empty>No mandates exist yet. Run the seed.</Empty>
        ) : (
          mandates.map((mandate) => {
            const pct =
              mandate.authorizedCents > 0
                ? Math.round(
                    (mandate.remainingCents / mandate.authorizedCents) * 100,
                  )
                : 0;
            const tone =
              mandate.status !== "ACTIVE"
                ? "var(--muted)"
                : pct <= 15
                  ? "var(--deny)"
                  : pct <= 40
                    ? "var(--escalate)"
                    : "var(--allow)";

            return (
              <div
                key={mandate.pravaMandateId}
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <strong style={{ fontSize: 14 }}>{mandate.vendorId}</strong>
                  <span
                    className="mono"
                    style={{
                      fontSize: 11,
                      color: mandate.status === "ACTIVE" ? tone : "var(--muted)",
                      border: `1px solid ${mandate.status === "ACTIVE" ? tone : "var(--border)"}`,
                      borderRadius: 3,
                      padding: "1px 6px",
                    }}
                  >
                    {mandate.status}
                  </span>
                  <span
                    className="mono"
                    style={{ marginLeft: "auto", fontSize: 13 }}
                  >
                    {formatMoney({
                      cents: mandate.remainingCents,
                      currency: "USD",
                    })}{" "}
                    <span style={{ color: "var(--muted)" }}>remaining</span>
                  </span>
                </div>

                {/* The leash, drawn. */}
                <div
                  style={{
                    height: 6,
                    background: "var(--panel-2)",
                    borderRadius: 3,
                    marginTop: 10,
                    overflow: "hidden",
                  }}
                  role="meter"
                  aria-valuenow={pct}
                  aria-label={`${mandate.vendorId} remaining authority`}
                >
                  <div
                    style={{
                      width: `${pct}%`,
                      height: "100%",
                      background: tone,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 18,
                    marginTop: 8,
                    fontSize: 12,
                    color: "var(--muted)",
                    flexWrap: "wrap",
                  }}
                >
                  <span>
                    Authorized{" "}
                    <span className="mono" style={{ color: "var(--text)" }}>
                      {formatMoney({
                        cents: mandate.authorizedCents,
                        currency: "USD",
                      })}
                    </span>
                  </span>
                  <span>
                    Spent{" "}
                    <span className="mono" style={{ color: "var(--text)" }}>
                      {formatMoney({
                        cents: mandate.spentCents,
                        currency: "USD",
                      })}
                    </span>
                  </span>
                  <span>
                    Expires{" "}
                    <span className="mono" style={{ color: "var(--text)" }}>
                      {mandate.expiresAt
                        ? mandate.expiresAt.toISOString().slice(0, 10)
                        : "—"}
                    </span>
                  </span>
                </div>

                <div style={{ marginTop: 8 }}>
                  <PravaId label="mandate" value={mandate.pravaMandateId} />
                  <span style={{ color: "var(--muted)", fontSize: 11 }}>
                    mirrored {mandate.mirroredAt.toISOString().slice(0, 16).replace("T", " ")}Z
                  </span>
                </div>
              </div>
            );
          })
        )}
      </Panel>

      <KillSwitch engaged={clock.killSwitchOn} />
    </>
  );
}
