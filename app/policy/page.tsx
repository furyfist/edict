import { prisma } from "@/lib/db/client";
import { formatMoney } from "@/lib/contracts";
import { DbError, Empty, Panel, PageHeader } from "../components/ui";

export const dynamic = "force-dynamic";

/**
 * Policy — where authority comes from.
 *
 * The English on the left, the compiled rules on the right, and every rule
 * linked to the exact fragment of the user's own sentence it came from. That
 * link is the product's most legible claim: the authority the agent acts under
 * is not something the system decided, it is something the user wrote down.
 *
 * Versions are immutable. Editing produces a new version, and a past ledger
 * entry's policy version always resolves to exactly the rules in force when
 * the decision was made.
 */

const EFFECT_TONE: Record<string, string> = {
  ALLOW_AUTO: "var(--allow)",
  REQUIRE_APPROVAL: "var(--escalate)",
  DENY: "var(--deny)",
};

export default async function PolicyPage() {
  let versions;

  try {
    versions = await prisma.policyVersion.findMany({
      include: { rules: { orderBy: { ordinal: "asc" } } },
      orderBy: { version: "desc" },
    });
  } catch {
    return (
      <>
        <PageHeader title="Policy" question="Where does authority come from?" />
        <DbError />
      </>
    );
  }

  const active = versions.find((v) => v.status === "ACTIVE");
  const history = versions.filter((v) => v.id !== active?.id);

  return (
    <>
      <PageHeader
        title="Policy"
        question="Where does the agent's authority come from?"
      />

      {!active ? (
        <Panel>
          <Empty>
            No policy is active. Nothing can be adjudicated until one is
            compiled and confirmed.
          </Empty>
        </Panel>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(240px, 1fr) minmax(320px, 1.4fr)",
              gap: 16,
              alignItems: "start",
            }}
          >
            <Panel>
              <h2 style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                WHAT YOU WROTE
              </h2>
              <pre
                style={{
                  margin: 0,
                  whiteSpace: "pre-wrap",
                  fontFamily: "inherit",
                  fontSize: 14,
                  lineHeight: 1.7,
                }}
              >
                {active.sourceText}
              </pre>
              <p
                style={{
                  color: "var(--muted)",
                  fontSize: 12,
                  marginBottom: 0,
                  marginTop: 14,
                }}
              >
                Version {active.version}, confirmed by{" "}
                {active.activatedBy ?? "—"} on{" "}
                {active.activatedAt
                  ? active.activatedAt.toISOString().slice(0, 10)
                  : "—"}
                .
              </p>
            </Panel>

            <Panel padded={false}>
              <h2
                style={{
                  fontSize: 12,
                  color: "var(--muted)",
                  padding: "16px 16px 10px",
                  margin: 0,
                }}
              >
                WHAT IS ENFORCED
              </h2>
              {active.rules.map((rule) => (
                <div
                  key={rule.id}
                  style={{
                    padding: "12px 16px",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <span
                      className="mono"
                      style={{ color: "var(--muted)", fontSize: 11 }}
                    >
                      {rule.ordinal}
                    </span>
                    <span
                      className="mono"
                      style={{
                        color: EFFECT_TONE[rule.effect] ?? "var(--muted)",
                        border: `1px solid ${EFFECT_TONE[rule.effect] ?? "var(--border)"}`,
                        borderRadius: 3,
                        padding: "1px 6px",
                        fontSize: 11,
                      }}
                    >
                      {rule.effect.replace(/_/g, " ")}
                    </span>
                    {rule.amountCeilingCents !== null ? (
                      <span
                        className="mono"
                        style={{ fontSize: 11, color: "var(--muted)" }}
                      >
                        ceiling{" "}
                        {formatMoney({
                          cents: rule.amountCeilingCents,
                          currency: "USD",
                        })}
                      </span>
                    ) : null}
                  </div>

                  <p style={{ margin: "6px 0 0", fontSize: 13 }}>
                    {rule.description}
                  </p>

                  {/* The link back to the user's own words. */}
                  <blockquote
                    style={{
                      margin: "6px 0 0",
                      paddingLeft: 10,
                      borderLeft: "2px solid var(--accent)",
                      color: "var(--muted)",
                      fontSize: 12,
                      fontStyle: "italic",
                    }}
                  >
                    “{rule.sourceFragment}”
                  </blockquote>
                </div>
              ))}
            </Panel>
          </div>

          <Panel>
            <h2 style={{ fontSize: 13, marginBottom: 8 }}>Evaluation order</h2>
            <p style={{ color: "var(--muted)", fontSize: 13, margin: 0 }}>
              Denials are considered first, all of them, before any permission
              is. A prohibition written last still defeats a permission written
              first — the order you happened to type your sentences in does not
              decide whether a prohibition holds. Among the remaining rules, the
              first match wins. If nothing matches, the action requires
              approval.
            </p>
          </Panel>
        </>
      )}

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
            VERSION HISTORY
          </h2>
          {history.map((version) => (
            <div
              key={version.id}
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--border)",
                display: "flex",
                gap: 12,
                alignItems: "baseline",
                fontSize: 13,
              }}
            >
              <span className="mono">v{version.version}</span>
              <span className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>
                {version.status}
              </span>
              <span style={{ color: "var(--muted)", fontSize: 12 }}>
                {version.rules.length} rules
              </span>
              <span
                style={{
                  color: "var(--muted)",
                  fontSize: 12,
                  marginLeft: "auto",
                }}
              >
                {version.createdAt.toISOString().slice(0, 10)}
              </span>
            </div>
          ))}
        </Panel>
      ) : null}
    </>
  );
}
