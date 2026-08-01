import { prisma } from "@/lib/db/client";
import { getClockState } from "@/lib/clock";
import { formatMoney } from "@/lib/contracts";
import { listExplained } from "@/lib/ledger";
import { LedgerRow } from "../components/LedgerRow";
import { DbError, Empty, Panel, PageHeader } from "../components/ui";

export const dynamic = "force-dynamic";

/**
 * Vendors — the evidence.
 *
 * This is where a judge goes to verify a claim. Every figure the agent
 * reasoned about and every figure the engine adjudicated against is here, in
 * the same form both of them read it. If the ledger says a renewal was refused
 * for a 26% price rise, this page is where you check that the rise was 26%.
 */
export default async function VendorsPage() {
  let vendors;
  let entries;
  let clock;

  try {
    [vendors, entries, clock] = await Promise.all([
      prisma.vendor.findMany({
        orderBy: { name: "asc" },
        include: {
          renewals: { orderBy: { dueAt: "asc" } },
          seats: { orderBy: { observedAt: "desc" }, take: 1 },
          messages: { orderBy: { receivedAt: "desc" }, take: 5 },
        },
      }),
      listExplained({ limit: 200 }),
      getClockState(),
    ]);
  } catch {
    return (
      <>
        <PageHeader title="Vendors" question="What is the evidence?" />
        <DbError />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Vendors"
        question="What does the system actually know about each one?"
      >
        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>
          as of {clock.now.toISOString().slice(0, 16).replace("T", " ")}Z
        </span>
      </PageHeader>

      {vendors.length === 0 ? (
        <Panel>
          <Empty>No vendors seeded.</Empty>
        </Panel>
      ) : (
        vendors.map((vendor) => {
          const seats = vendor.seats[0];
          const history = entries.filter(
            (item) => item.entry.vendorId === vendor.id,
          );

          return (
            <Panel key={vendor.id} padded={false}>
              <div style={{ padding: 16 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <h2 style={{ fontSize: 16 }}>{vendor.name}</h2>
                  <span
                    className="mono"
                    style={{ fontSize: 11, color: "var(--muted)" }}
                  >
                    {vendor.category}
                  </span>
                  {vendor.merchantId ? (
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: "var(--muted)" }}
                    >
                      merchant {vendor.merchantId}
                    </span>
                  ) : (
                    <span
                      className="mono"
                      style={{ fontSize: 11, color: "var(--escalate)" }}
                    >
                      no merchant — cannot be paid unattended
                    </span>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 24,
                    marginTop: 12,
                    flexWrap: "wrap",
                    fontSize: 13,
                  }}
                >
                  <div>
                    <div style={{ color: "var(--muted)", fontSize: 11 }}>
                      Seat usage
                    </div>
                    {seats ? (
                      <span className="mono">
                        {seats.active} active / {seats.licensed} licensed
                        {seats.dormant > 0 ? (
                          <span style={{ color: "var(--escalate)" }}>
                            {" "}
                            · {seats.dormant} dormant
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span style={{ color: "var(--escalate)" }}>
                        no usage data
                      </span>
                    )}
                  </div>
                </div>

                {vendor.renewals.length > 0 ? (
                  <div style={{ marginTop: 14 }}>
                    <div
                      style={{
                        color: "var(--muted)",
                        fontSize: 11,
                        marginBottom: 6,
                      }}
                    >
                      RENEWAL TIMELINE
                    </div>
                    {vendor.renewals.map((renewal) => {
                      const rise =
                        renewal.previousAmountCents &&
                        renewal.previousAmountCents > 0
                          ? Math.round(
                              ((renewal.amountCents -
                                renewal.previousAmountCents) *
                                10_000) /
                                renewal.previousAmountCents,
                            )
                          : null;

                      return (
                        <div
                          key={renewal.id}
                          style={{
                            display: "flex",
                            gap: 12,
                            alignItems: "baseline",
                            fontSize: 13,
                            padding: "4px 0",
                            flexWrap: "wrap",
                          }}
                        >
                          <span className="mono" style={{ color: "var(--muted)" }}>
                            {renewal.dueAt.toISOString().slice(0, 10)}
                          </span>
                          <span className="mono">
                            {formatMoney({
                              cents: renewal.amountCents,
                              currency: "USD",
                            })}
                          </span>
                          <span
                            className="mono"
                            style={{ color: "var(--muted)", fontSize: 11 }}
                          >
                            {renewal.cadence} · cycle {renewal.cycleKey}
                          </span>
                          {rise !== null && rise !== 0 ? (
                            <span
                              className="mono"
                              style={{
                                fontSize: 11,
                                color:
                                  rise > 1500
                                    ? "var(--escalate)"
                                    : "var(--muted)",
                              }}
                            >
                              {rise > 0 ? "+" : ""}
                              {(rise / 100).toFixed(1)}% vs prior
                            </span>
                          ) : null}
                          <span
                            className="mono"
                            style={{ fontSize: 11, color: "var(--muted)" }}
                          >
                            {renewal.state}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}

                {vendor.messages.length > 0 ? (
                  <div style={{ marginTop: 14 }}>
                    <div
                      style={{
                        color: "var(--muted)",
                        fontSize: 11,
                        marginBottom: 6,
                      }}
                    >
                      MESSAGES FROM THIS VENDOR — untrusted input
                    </div>
                    {vendor.messages.map((message) => (
                      <div
                        key={message.id}
                        style={{
                          borderLeft: `2px solid ${message.injected ? "var(--deny)" : "var(--border)"}`,
                          paddingLeft: 10,
                          marginBottom: 8,
                          fontSize: 13,
                        }}
                      >
                        <div style={{ display: "flex", gap: 8 }}>
                          <strong>{message.subject}</strong>
                          {message.injected ? (
                            <span
                              className="mono"
                              style={{ color: "var(--deny)", fontSize: 10 }}
                            >
                              INJECTED VIA ATTACK CONSOLE
                            </span>
                          ) : null}
                        </div>
                        <p
                          style={{
                            margin: "2px 0 0",
                            color: "var(--muted)",
                            fontSize: 12,
                          }}
                        >
                          {message.body}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              {history.length > 0 ? (
                <div style={{ borderTop: "1px solid var(--border)" }}>
                  {history.map((item) => (
                    <LedgerRow key={item.entry.id} item={item} />
                  ))}
                </div>
              ) : null}
            </Panel>
          );
        })
      )}
    </>
  );
}
