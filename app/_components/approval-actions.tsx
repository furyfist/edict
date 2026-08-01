"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Approve / reject controls.
 *
 * For a CEILING_RAISE the approve button is labelled honestly. Clicking it does
 * NOT raise the ceiling — it records intent, and the ceiling only moves after a
 * passkey ceremony on Prava's surface. The copy says so, because a control that
 * implies more power than it has is the exact confusion this product exists to
 * remove.
 */
export function ApprovalActions({
  id,
  type,
}: {
  id: string;
  type: "POLICY_EXCEPTION" | "CEILING_RAISE";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [passkeyUrl, setPasskeyUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<{
    message: string;
    detail: string;
  } | null>(null);

  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? `Failed with status ${response.status}.`);
        return;
      }

      if (decision === "APPROVE" && body.requiresPasskey) {
        const setup = await fetch("/api/approvals/passkey", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approvalId: id }),
        });
        const setupBody = await setup.json().catch(() => ({}));

        // No provider configured. Checked before the generic error branch,
        // because this is a disclosed state rather than a failure — and the
        // thing it discloses is the invariant itself.
        if (setupBody.available === false) {
          setUnavailable({
            message: setupBody.message ?? "No passkey ceremony is available.",
            detail: setupBody.detail ?? "The ceiling is unchanged.",
          });
          router.refresh();
          return;
        }

        if (!setup.ok) {
          setError(
            setupBody.error ?? "Could not open the mandate setup session.",
          );
          return;
        }
        setPasskeyUrl(setupBody.approvalUrl ?? null);
        return;
      }

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (unavailable) {
    // Deliberately not styled as an error. Nothing failed: the system was
    // asked for authority it cannot create and declined to invent it.
    return (
      <div className="rounded border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="text-xs text-amber-200">{unavailable.message}</p>
        <p className="mt-1 text-xs text-neutral-400">{unavailable.detail}</p>
        <p className="mt-2 text-[11px] uppercase tracking-wide text-neutral-500">
          ceiling unchanged · no new authority granted
        </p>
      </div>
    );
  }

  if (passkeyUrl) {
    return (
      <div className="rounded border border-sky-500/30 bg-sky-500/5 p-3">
        <p className="text-xs text-sky-200">
          Recorded. The ceiling has not moved.
        </p>
        <p className="mt-1 text-xs text-neutral-400">
          Complete the passkey ceremony to grant the new authority.
        </p>
        <a
          href={passkeyUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block rounded border border-sky-500/40 px-2.5 py-1 text-xs text-sky-200 hover:bg-sky-500/10"
        >
          Open passkey ceremony ↗
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("APPROVE")}
          className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 disabled:opacity-40"
        >
          {type === "CEILING_RAISE" ? "Approve — needs passkey" : "Approve"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => decide("REJECT")}
          className="rounded border border-neutral-600 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
        >
          Reject
        </button>
      </div>
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
