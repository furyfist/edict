"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The kill switch.
 *
 * Typed confirmation to engage, one click to release. The asymmetry is
 * deliberate — withdrawing an agent's authority should be considered, and
 * restoring it should not be accidental either, but the dangerous direction is
 * the one that hands power back.
 */
export function KillSwitch({ engaged }: { engaged: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(engage: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/kill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engage }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.error ?? `Failed with status ${response.status}.`);
        return;
      }
      const body = await response.json();
      if (Array.isArray(body.mandatesFailed) && body.mandatesFailed.length > 0) {
        setError(
          `Halted, but ${body.mandatesFailed.length} mandate(s) could not be changed at Prava.`,
        );
      }
      setConfirming(false);
      setTyped("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (engaged) {
    return (
      <div className="rounded border border-rose-500/40 bg-rose-500/10 p-4">
        <p className="text-sm font-medium text-rose-200">Agent halted.</p>
        <p className="mt-1 text-xs text-neutral-300">
          Every mandate is paused and the next tick will refuse to run.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => send(false)}
          className="mt-3 rounded border border-neutral-600 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy ? "Restoring…" : "Restore authority"}
        </button>
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded border border-neutral-800 p-4">
      {confirming ? (
        <>
          <p className="text-sm text-neutral-200">
            Type <span className="font-mono text-rose-300">HALT</span> to pause
            every mandate and stop the agent.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="w-28 rounded border border-neutral-700 bg-transparent px-2 py-1 font-mono text-xs text-neutral-100 outline-none focus:border-neutral-500"
              placeholder="HALT"
              autoFocus
            />
            <button
              type="button"
              disabled={typed !== "HALT" || busy}
              onClick={() => send(true)}
              className="rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200 disabled:opacity-40"
            >
              {busy ? "Halting…" : "Halt the agent"}
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
              className="rounded px-2.5 py-1 text-xs text-neutral-500 hover:text-neutral-300"
            >
              Cancel
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-neutral-200">Kill switch</p>
          <p className="mt-1 text-xs text-neutral-500">
            Pauses every mandate at Prava and halts the next tick.
          </p>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="mt-3 rounded border border-neutral-600 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800"
          >
            Halt the agent
          </button>
        </>
      )}
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
