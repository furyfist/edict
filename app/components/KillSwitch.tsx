"use client";

import { useState } from "react";

/**
 * The kill switch control.
 *
 * The most reassuring object in the product, and the one place a confirmation
 * step earns its cost: engaging this pauses every mandate at the network, and
 * an operator who hits it by accident during a demo has to un-pause each one
 * deliberately. Typing the word is the cheapest way to be sure the press was
 * intentional.
 */
export function KillSwitch({ engaged }: { engaged: boolean }) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const armed = typed.trim().toUpperCase() === "HALT";

  async function fire(engage: boolean) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/kill", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ engagedBy: "finance-lead", engage }),
      });
      const body = (await response.json()) as { note?: string; error?: string };
      setResult(body.note ?? body.error ?? "Done.");
      setTyped("");
      // Reload so every surface reflects the halted state, not just this one.
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      setResult(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  if (engaged) {
    return (
      <div
        style={{
          border: "1px solid var(--deny)",
          borderRadius: 6,
          padding: 16,
          background: "rgba(248,113,113,0.06)",
        }}
      >
        <strong style={{ color: "var(--deny)" }}>
          The kill switch is engaged.
        </strong>
        <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 12px" }}>
          Every mandate that could be reached is paused and the next tick will
          halt. Releasing this lets ticks run again; it does not resume paused
          mandates — resume each one deliberately.
        </p>
        <button
          onClick={() => fire(false)}
          disabled={busy}
          style={{
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 4,
            padding: "6px 12px",
            cursor: busy ? "wait" : "pointer",
            fontSize: 13,
          }}
        >
          {busy ? "Releasing…" : "Release the halt"}
        </button>
        {result ? (
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 0 }}>
            {result}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: 16,
      }}
    >
      <strong>Stop everything</strong>
      <p style={{ color: "var(--muted)", fontSize: 13, margin: "6px 0 12px" }}>
        Pauses every active mandate at the payment network and halts the next
        tick. Type <code>HALT</code> to confirm.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="HALT"
          aria-label="Type HALT to confirm"
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 4,
            padding: "6px 10px",
            fontFamily: "var(--mono)",
            fontSize: 13,
            width: 120,
          }}
        />
        <button
          onClick={() => fire(true)}
          disabled={!armed || busy}
          style={{
            background: armed ? "var(--deny)" : "transparent",
            border: `1px solid ${armed ? "var(--deny)" : "var(--border)"}`,
            color: armed ? "#fff" : "var(--muted)",
            borderRadius: 4,
            padding: "6px 14px",
            cursor: armed && !busy ? "pointer" : "not-allowed",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {busy ? "Stopping…" : "Engage kill switch"}
        </button>
      </div>
      {result ? (
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 0 }}>
          {result}
        </p>
      ) : null}
    </div>
  );
}
