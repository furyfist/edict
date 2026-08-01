import type { ReactNode } from "react";

/**
 * Shared page primitives.
 *
 * These exist so that every surface renders the same shapes — the ledger, the
 * refusal view, and the vendor timeline are the same component with different
 * filters, which is what makes them read as one system rather than three
 * screens that happen to be in the same app.
 */

export function PageHeader({
  title,
  question,
  children,
}: {
  title: string;
  question: string;
  children?: ReactNode;
}) {
  return (
    <header style={{ marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <h1 style={{ fontSize: 20 }}>{title}</h1>
          <p style={{ color: "var(--muted)", margin: "4px 0 0", fontSize: 13 }}>
            {question}
          </p>
        </div>
        {children}
      </div>
    </header>
  );
}

export function Panel({
  children,
  padded = true,
}: {
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <div
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: padded ? 16 : 0,
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

const OUTCOME_TONE: Record<string, string> = {
  EXECUTED: "var(--allow)",
  APPROVED_AND_EXECUTED: "var(--allow)",
  REFUSED: "var(--deny)",
  ESCALATED: "var(--escalate)",
  REJECTED_BY_HUMAN: "var(--deny)",
  EXPIRED: "var(--muted)",
  NETWORK_DECLINE: "var(--deny)",
  HALTED: "var(--escalate)",
  ADAPTER_FAILURE: "var(--escalate)",
};

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const tone = OUTCOME_TONE[outcome] ?? "var(--muted)";
  return (
    <span
      className="mono"
      style={{
        color: tone,
        border: `1px solid ${tone}`,
        borderRadius: 3,
        padding: "1px 6px",
        fontSize: 11,
        whiteSpace: "nowrap",
      }}
    >
      {outcome.replace(/_/g, " ")}
    </span>
  );
}

/**
 * Model prose, in its own labeled region.
 *
 * This component exists to make one distinction visible on every page that
 * shows agent output: a rendered explanation is the decision restated from its
 * own fields, and a rationale is a sentence a language model wrote. Both are
 * worth showing. Confusing them is what the labeled border prevents.
 */
export function AgentProse({
  rationale,
  rejectedAlternative,
}: {
  rationale: string | null;
  rejectedAlternative: string | null;
}) {
  if (!rationale && !rejectedAlternative) return null;

  return (
    <div
      style={{
        borderLeft: "2px solid var(--accent)",
        paddingLeft: 12,
        marginTop: 12,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: "0.08em",
          color: "var(--accent)",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        Agent rationale — model output, not a verified fact
      </div>
      {rationale ? (
        <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
          {rationale}
        </p>
      ) : null}
      {rejectedAlternative ? (
        <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
          <em>Considered and rejected:</em> {rejectedAlternative}
        </p>
      ) : null}
    </div>
  );
}

/** The four attributions, always rendered together, always in this order. */
export function Attribution({
  decidedBy,
  authorizedBy,
  executedBy,
  recordedBy,
}: {
  decidedBy: string;
  authorizedBy: string;
  executedBy: string;
  recordedBy: string;
}) {
  const rows = [
    ["Decided by", decidedBy],
    ["Authorized by", authorizedBy],
    ["Executed by", executedBy],
    ["Recorded by", recordedBy],
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "2px 12px",
        fontSize: 12,
        marginTop: 12,
      }}
    >
      {rows.map(([label, value]) => (
        <div key={label} style={{ display: "contents" }}>
          <span style={{ color: "var(--muted)" }}>{label}</span>
          <span>{value}</span>
        </div>
      ))}
    </div>
  );
}

/** A Prava identifier, styled so a judge can find it and cross-check it. */
export function PravaId({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;
  return (
    <span
      className="mono"
      style={{
        display: "inline-block",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 3,
        padding: "2px 6px",
        marginRight: 8,
        fontSize: 11,
      }}
      title={`${label} — resolves in Prava's dashboard`}
    >
      <span style={{ color: "var(--muted)" }}>{label}</span> {value}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p style={{ color: "var(--muted)", padding: "24px 0", textAlign: "center" }}>
      {children}
    </p>
  );
}

export function DbError() {
  return (
    <Panel>
      <p style={{ color: "var(--escalate)", margin: 0 }}>
        No database connection. Set <code>DATABASE_URL</code>, run{" "}
        <code>npm run db:push</code>, then <code>npm run seed</code>.
      </p>
    </Panel>
  );
}
