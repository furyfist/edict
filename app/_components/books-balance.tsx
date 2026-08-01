"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * DO THE BOOKS BALANCE?
 *
 * The Authority page renders the leash. This renders whether anyone has checked
 * that the leash held — which is the question the rest of the page cannot answer
 * about itself.
 *
 * ---------------------------------------------------------------------------
 * FOUR STATES, AND WHY NONE OF THEM COLLAPSE
 *
 *   balanced      both books read, both directions, everything lines up
 *   discrepant    something does not line up, and it is named with an id
 *   unverifiable  a book could not be read — NOT a clean result
 *   stale         a real result, about a ledger that has since moved on
 *   (absent)      nobody has run one
 *
 * Collapsing unverifiable into balanced would be the most dangerous simplification
 * available anywhere in this product: a provider outage would render as proof of
 * completeness. Collapsing stale into current would be the second.
 * ---------------------------------------------------------------------------
 */

interface Discrepancy {
  kind: string;
  chargeId: string | null;
  entryId: string | null;
  mandateId: string;
  vendorName: string | null;
  detail: string;
}

interface Unreadable {
  mandateId: string;
  vendorName: string | null;
  reason: string;
  message: string;
}

interface Attestation {
  ranAt: string;
  ledgerHead: string;
  attested: boolean;
  stale: boolean;
  subject: {
    status: "BALANCED" | "DISCREPANT" | "UNVERIFIABLE";
    provider: "mock" | "prava";
    mandatesChecked: number;
    entriesChecked: number;
    chargesChecked: number;
    matched: number;
    discrepancies: Discrepancy[];
    unreadable: Unreadable[];
    sentence: string;
  };
}

const STATUS_STYLE: Record<string, string> = {
  BALANCED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  DISCREPANT: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  UNVERIFIABLE: "border-amber-500/30 bg-amber-500/10 text-amber-200",
};

const STATUS_WORD: Record<string, string> = {
  BALANCED: "books balance",
  DISCREPANT: "books do not balance",
  UNVERIFIABLE: "cannot be verified",
};

export function BooksBalance({ initial }: { initial: Attestation | null }) {
  const router = useRouter();
  const [attestation, setAttestation] = useState<Attestation | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reconcile() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reconcile", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? `Failed with status ${response.status}.`);
        return;
      }

      const fresh = await fetch("/api/reconcile");
      const freshBody = await fresh.json().catch(() => ({}));
      setAttestation(freshBody.attestation ?? null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const subject = attestation?.subject;

  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-medium text-neutral-100">
            Ledger completeness
          </h2>
          {subject ? (
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                STATUS_STYLE[subject.status] ?? "border-neutral-700 text-neutral-400"
              }`}
            >
              {STATUS_WORD[subject.status] ?? subject.status}
            </span>
          ) : (
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
              never checked
            </span>
          )}
          {attestation?.stale ? (
            <span className="rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
              stale
            </span>
          ) : null}
          {attestation && !attestation.attested ? (
            <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
              unsigned
            </span>
          ) : null}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={reconcile}
          className="rounded border border-neutral-600 px-2.5 py-1 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          {busy ? "reconciling…" : "Reconcile now"}
        </button>
      </div>

      <p className="mt-2 text-xs leading-relaxed text-neutral-400">
        {subject
          ? subject.sentence
          : "Nobody has compared this ledger against the payment network's own record. Append-only proves nothing was altered; only this proves nothing was hidden."}
      </p>

      {attestation?.stale ? (
        <p className="mt-2 text-xs text-amber-200">
          The ledger has moved since this was checked. This result describes an
          earlier state of the record, not the current one.
        </p>
      ) : null}

      {subject ? (
        <>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-neutral-500">
            <div className="flex gap-1.5">
              <dt>checked against</dt>
              <dd className="text-neutral-300">
                {subject.provider === "prava" ? "Prava" : "the mock provider"}
              </dd>
            </div>
            <div className="flex gap-1.5">
              <dt>mandates</dt>
              <dd className="text-neutral-300">{subject.mandatesChecked}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>our entries</dt>
              <dd className="text-neutral-300">{subject.entriesChecked}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>their charges</dt>
              <dd className="text-neutral-300">{subject.chargesChecked}</dd>
            </div>
            <div className="flex gap-1.5">
              <dt>matched</dt>
              <dd className="text-neutral-300">{subject.matched}</dd>
            </div>
          </dl>

          {subject.discrepancies.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {subject.discrepancies.map((d, index) => (
                <li
                  key={`${d.kind}-${d.chargeId ?? d.entryId ?? index}`}
                  className="rounded border border-rose-500/30 bg-rose-500/5 p-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-wide text-rose-300">
                      {d.kind.toLowerCase().replace(/_/g, " ")}
                    </span>
                    {/* The identifier, always. It is what makes this checkable
                        in Prava's own dashboard rather than just alarming. */}
                    <span className="font-mono text-[10px] text-neutral-400">
                      {d.chargeId ?? d.entryId ?? d.mandateId}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-300">{d.detail}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {subject.unreadable.length > 0 ? (
            <div className="mt-3 rounded border border-amber-500/30 bg-amber-500/5 p-2.5">
              <p className="text-xs text-amber-200">
                {subject.unreadable.length} mandate
                {subject.unreadable.length === 1 ? "" : "s"} could not be checked.
              </p>
              <ul className="mt-1 space-y-0.5">
                {subject.unreadable.slice(0, 4).map((u) => (
                  <li key={u.mandateId} className="text-[11px] text-neutral-400">
                    {u.vendorName ?? u.mandateId} — {u.reason.toLowerCase().replace(/_/g, " ")}
                  </li>
                ))}
                {subject.unreadable.length > 4 ? (
                  <li className="text-[11px] text-neutral-500">
                    …and {subject.unreadable.length - 4} more
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
