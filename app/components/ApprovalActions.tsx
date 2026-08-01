"use client";

import { useState } from "react";

/**
 * The approval controls.
 *
 * Two buttons, and which pair you see depends on whether the request needs
 * more authority than exists. That branch is decided on the server by
 * `requiresPasskeyCeremony` and rendered as two visibly different things,
 * because the entire trust argument rests on a human being able to tell the
 * difference between "yes, spend what you already have" and "here, have more".
 *
 * The ceiling-raise button does not approve anything. It starts a ceremony.
 */
export function ApprovalActions({
  approvalId,
  requiresPasskey,
  amountCents,
  expired,
}: {
  approvalId: string;
  requiresPasskey: boolean;
  amountCents: number;
  expired: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function post(path: string, body: Record<string, unknown>) {
    setBusy(path);
    setMessage(null);
    try {
      const response = await fetch(`/api/approvals/${approvalId}/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        detail?: string;
        error?: string;
      };
      setMessage(payload.detail ?? payload.error ?? "Done.");
      if (response.ok) setTimeout(() => window.location.reload(), 900);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  if (expired) {
    return (
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "12px 0 0" }}>
        This approval expired. Consent was given for evidence that is now stale;
        it cannot be revived. The next tick will raise a fresh one if the
        situation still warrants it.
      </p>
    );
  }

  const buttonStyle = (tone: string, filled: boolean) => ({
    background: filled ? tone : "transparent",
    border: `1px solid ${tone}`,
    color: filled ? "#0b0d10" : tone,
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: busy ? "wait" : "pointer",
  });

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {requiresPasskey ? (
          <button
            disabled={Boolean(busy)}
            onClick={() =>
              post("ceiling-raise", {
                requestedCeilingCents: amountCents,
                // In the demo this is the id returned by the ceremony. It is
                // never generated here — an empty value is refused server-side.
                passkeyCeremonyId:
                  typeof window !== "undefined"
                    ? (window.prompt(
                        "Complete the passkey ceremony in Prava, then paste the ceremony id:",
                      ) ?? "")
                    : "",
                requestedBy: "finance-lead",
              })
            }
            style={buttonStyle("var(--escalate)", true)}
          >
            {busy === "ceiling-raise"
              ? "Waiting for the ceremony…"
              : "Raise the ceiling — requires a passkey"}
          </button>
        ) : (
          <button
            disabled={Boolean(busy)}
            onClick={() => post("approve", { approvedBy: "finance-lead" })}
            style={buttonStyle("var(--allow)", true)}
          >
            {busy === "approve" ? "Charging…" : "Approve this one charge"}
          </button>
        )}

        <button
          disabled={Boolean(busy)}
          onClick={() => post("reject", { rejectedBy: "finance-lead" })}
          style={buttonStyle("var(--deny)", false)}
        >
          {busy === "reject" ? "Recording…" : "Reject"}
        </button>
      </div>

      <p
        style={{
          color: "var(--muted)",
          fontSize: 12,
          margin: "8px 0 0",
          maxWidth: 560,
        }}
      >
        {requiresPasskey
          ? "This is more than the mandate holds. Granting it means minting a new mandate at the payment network, which requires a passkey ceremony — this application cannot grant authority to itself."
          : "This permits exactly one charge, within authority the mandate already holds. It grants nothing further."}
      </p>

      {message ? (
        <p style={{ fontSize: 13, marginTop: 8 }}>{message}</p>
      ) : null}
    </div>
  );
}
