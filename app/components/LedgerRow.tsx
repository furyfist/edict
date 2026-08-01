import Link from "next/link";
import type { ExplainedEntry } from "@/lib/ledger";
import { EntryDetail } from "./EntryDetail";
import { AgentProse, Attribution, OutcomeBadge, PravaId } from "./ui";

/**
 * One ledger entry.
 *
 * Every entry renders through this component, on every surface. That is what
 * makes the ledger read as a system: the same four attributions in the same
 * order, the same explanation structure, the same separation between rendered
 * fact and model prose, whether you are looking at a completed charge or a
 * refusal or a halt.
 */
export function LedgerRow({
  item,
  expanded = false,
}: {
  item: ExplainedEntry;
  expanded?: boolean;
}) {
  const { entry, explanation, agentProse } = item;

  return (
    <article
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <OutcomeBadge outcome={entry.outcome} />
        <strong style={{ fontSize: 14 }}>{explanation.headline}</strong>
        <span
          className="mono"
          style={{ color: "var(--muted)", marginLeft: "auto", fontSize: 11 }}
        >
          {entry.recordedAt.replace("T", " ").replace(".000Z", "Z")}
        </span>
      </div>

      <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 13 }}>
        {explanation.reason}
      </p>

      {explanation.sourceFragment ? (
        <blockquote
          style={{
            margin: "8px 0 0",
            paddingLeft: 12,
            borderLeft: "2px solid var(--border)",
            color: "var(--text)",
            fontSize: 13,
            fontStyle: "italic",
          }}
        >
          “{explanation.sourceFragment}”
          <span
            style={{
              display: "block",
              fontStyle: "normal",
              color: "var(--muted)",
              fontSize: 11,
              marginTop: 2,
            }}
          >
            — your policy, as written
          </span>
        </blockquote>
      ) : null}

      {explanation.counterfactual ? (
        <p style={{ margin: "8px 0 0", color: "var(--muted)", fontSize: 13 }}>
          <span style={{ color: "var(--text)" }}>What would have differed:</span>{" "}
          {explanation.counterfactual}
        </p>
      ) : null}

      <p style={{ margin: "8px 0 0", fontSize: 13 }}>
        {explanation.financialImpact}
      </p>

      {expanded ? (
        <>
          <Attribution {...explanation.attribution} />
          <div style={{ marginTop: 12 }}>
            <PravaId label="mandate" value={entry.prava.mandateId} />
            <PravaId label="charge" value={entry.prava.chargeId} />
            <PravaId label="session" value={entry.prava.sessionId} />
          </div>
          <AgentProse {...agentProse} />
        </>
      ) : (
        <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
          {/* The modal is the primary expansion surface; the route is the
              shareable one. Both render the same component. */}
          <EntryDetail item={item} />
          <Link
            href={`/ledger/${entry.id}`}
            style={{ color: "var(--muted)", fontSize: 12 }}
          >
            permalink
          </Link>
          {entry.prava.chargeId ? (
            <PravaId label="charge" value={entry.prava.chargeId} />
          ) : null}
        </div>
      )}
    </article>
  );
}
