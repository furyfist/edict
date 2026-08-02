"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { Badge } from "@/app/_components/ui/badge";
import { Card } from "@/app/_components/ui/card";
import { Alert } from "@/app/_components/feedback/alert";
import { MonoId } from "./mono";
import { humanise, reconcileTone } from "@/app/_lib/tone";

/**
 * DO THE BOOKS BALANCE?
 *
 * The Authority page renders the leash. This renders whether anyone has checked
 * that the leash held — which is the question the rest of the page cannot
 * answer about itself.
 *
 * ---------------------------------------------------------------------------
 * FIVE STATES, AND WHY NONE OF THEM COLLAPSE
 *
 *   balanced      both books read, both directions, everything lines up
 *   discrepant    something does not line up, and it is named with an id
 *   unverifiable  a book could not be read — NOT a clean result
 *   stale         a real result, about a ledger that has since moved on
 *   (absent)      nobody has run one
 *
 * Collapsing unverifiable into balanced would be the most dangerous
 * simplification available anywhere in this product: a provider outage would
 * render as proof of completeness. Collapsing stale into current would be the
 * second. The tone map keeps them three different colours; this component keeps
 * them three different sentences.
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

  // Held disabled through the page refetch, not just the POST — see the note in
  // `kill-switch.tsx`. A reconciliation that appears finished while the rest of
  // the page still shows the previous result is the one outcome this component
  // exists to prevent.
  const [isPending, startTransition] = useTransition();
  const refreshing = useRef(false);
  const working = busy || isPending;

  useEffect(() => {
    if (refreshing.current && !isPending) {
      refreshing.current = false;
      setBusy(false);
    }
  }, [isPending]);

  async function reconcile() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reconcile", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? `Failed with status ${response.status}.`);
        setBusy(false);
        return;
      }

      const fresh = await fetch("/api/reconcile");
      const freshBody = await fresh.json().catch(() => ({}));
      setAttestation(freshBody.attestation ?? null);
      refreshing.current = true;
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const subject = attestation?.subject;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-card-title text-foreground">
            Ledger completeness
          </h3>
          {subject ? (
            <Badge tone={reconcileTone(subject.status)}>
              {STATUS_WORD[subject.status] ?? humanise(subject.status)}
            </Badge>
          ) : (
            <Badge tone="neutral">never checked</Badge>
          )}
          {attestation?.stale ? <Badge tone="warn">stale</Badge> : null}
          {attestation && !attestation.attested ? (
            <Badge tone="neutral">unsigned</Badge>
          ) : null}
        </div>

        <Button variant="outline" size="sm" disabled={working} onClick={reconcile}>
          <RefreshCw
            aria-hidden
            className={working ? "animate-spin" : undefined}
          />
          {working ? "Reconciling…" : "Reconcile now"}
        </Button>
      </div>

      <p className="text-body text-text-muted mt-3">
        {subject
          ? subject.sentence
          : "Nobody has compared this ledger against the payment network's own record. Append-only proves nothing was altered; only this proves nothing was hidden."}
      </p>

      {attestation?.stale ? (
        <Alert tone="warn" title="This result is out of date." className="mt-3">
          The ledger has moved since this was checked. It describes an earlier
          state of the record, not the current one.
        </Alert>
      ) : null}

      {subject ? (
        <>
          <dl className="text-meta mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {[
              [
                "checked against",
                subject.provider === "prava" ? "Prava" : "the mock provider",
              ],
              ["mandates", subject.mandatesChecked],
              ["our entries", subject.entriesChecked],
              ["their charges", subject.chargesChecked],
              ["matched", subject.matched],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-baseline gap-1.5">
                <dt className="text-label text-text-subtle">{label}</dt>
                <dd className="text-foreground tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          {subject.discrepancies.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {subject.discrepancies.map((d, index) => (
                <li
                  key={`${d.kind}-${d.chargeId ?? d.entryId ?? index}`}
                  className="border-danger/40 bg-risk-high-bg rounded-md border p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-label text-danger">
                      {humanise(d.kind)}
                    </span>
                    {/* The identifier, always. It is what makes this checkable
                        in Prava's own dashboard rather than just alarming. */}
                    <MonoId
                      value={d.chargeId ?? d.entryId ?? d.mandateId}
                      label="identifier"
                    />
                  </div>
                  <p className="text-meta text-foreground mt-1.5">{d.detail}</p>
                </li>
              ))}
            </ul>
          ) : null}

          {subject.unreadable.length > 0 ? (
            <Alert
              tone="warn"
              className="mt-4"
              title={`${subject.unreadable.length} mandate${
                subject.unreadable.length === 1 ? "" : "s"
              } could not be checked.`}
            >
              <ul className="flex flex-col gap-0.5">
                {subject.unreadable.slice(0, 4).map((u) => (
                  <li key={u.mandateId}>
                    {u.vendorName ?? u.mandateId} — {humanise(u.reason)}
                  </li>
                ))}
                {subject.unreadable.length > 4 ? (
                  <li>…and {subject.unreadable.length - 4} more</li>
                ) : null}
              </ul>
            </Alert>
          ) : null}
        </>
      ) : null}

      {error ? (
        <Alert
          tone="danger"
          title="The reconciliation could not run."
          detail={error}
          className="mt-3"
        />
      ) : null}
    </Card>
  );
}
