"use client";

import { useState } from "react";
import type { ExplainedEntry } from "@/lib/ledger";
import { Modal } from "./Modal";
import { AgentProse, Attribution, OutcomeBadge, PravaId } from "./ui";

/**
 * The ledger detail modal.
 *
 * What this surface exists to carry is the attribution chain and the Prava
 * identifiers. A judge should be able to read four separate actors here and
 * then take the charge id into Prava's own dashboard and find the same
 * transaction — that cross-check is the strongest credibility moment the demo
 * has, so the identifiers are given their own block rather than being a
 * footnote.
 */
export function EntryDetail({ item }: { item: ExplainedEntry }) {
  const [open, setOpen] = useState(false);
  const { entry, explanation, agentProse } = item;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--accent)",
          cursor: "pointer",
          fontSize: 12,
          padding: 0,
        }}
      >
        Full attribution chain →
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={explanation.headline}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <OutcomeBadge outcome={entry.outcome} />
          <span className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>
            {entry.recordedAt}
          </span>
        </div>

        <p style={{ marginTop: 12, fontSize: 13 }}>{explanation.reason}</p>

        {explanation.sourceFragment ? (
          <blockquote
            style={{
              margin: "10px 0 0",
              paddingLeft: 12,
              borderLeft: "2px solid var(--accent)",
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
              }}
            >
              — your policy, as written
            </span>
          </blockquote>
        ) : null}

        {explanation.counterfactual ? (
          <p style={{ marginTop: 12, fontSize: 13, color: "var(--muted)" }}>
            <span style={{ color: "var(--text)" }}>
              What would have differed:
            </span>{" "}
            {explanation.counterfactual}
          </p>
        ) : null}

        <p style={{ marginTop: 12, fontSize: 13 }}>
          {explanation.financialImpact}
        </p>

        <h3
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 20,
            letterSpacing: "0.06em",
          }}
        >
          THE FOUR ACTORS
        </h3>
        <Attribution {...explanation.attribution} />

        <h3
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginTop: 20,
            letterSpacing: "0.06em",
          }}
        >
          VERIFY IN PRAVA
        </h3>
        <div style={{ marginTop: 8 }}>
          {entry.prava.mandateId || entry.prava.chargeId ? (
            <>
              <PravaId label="mandate" value={entry.prava.mandateId} />
              <PravaId label="charge" value={entry.prava.chargeId} />
              <PravaId label="session" value={entry.prava.sessionId} />
              <p
                style={{
                  color: "var(--muted)",
                  fontSize: 12,
                  marginTop: 8,
                  marginBottom: 0,
                }}
              >
                These resolve in Prava&rsquo;s own dashboard. Nothing about this
                record depends on trusting this application.
              </p>
            </>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 12, margin: 0 }}>
              No network identifiers, because the network was never reached —
              nothing was charged.
            </p>
          )}
        </div>

        <AgentProse {...agentProse} />
      </Modal>
    </>
  );
}
