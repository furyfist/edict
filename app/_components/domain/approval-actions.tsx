"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Button, ButtonLink } from "@/app/_components/ui/button";
import { Alert } from "@/app/_components/feedback/alert";

/**
 * Approve / reject controls.
 *
 * For a CEILING_RAISE the approve button is labelled honestly. Clicking it does
 * NOT raise the ceiling — it records intent, and the ceiling only moves after a
 * passkey ceremony on Prava's surface. The copy says so, because a control that
 * implies more power than it has is the exact confusion this product exists to
 * remove.
 *
 * Loading is a present-participle label, never a spinner. "Approving…" on a
 * 32px control avoids the layout shift a spinner causes and reads better.
 */
export function ApprovalActions({
  id,
  type,
}: {
  id: string;
  type: "POLICY_EXCEPTION" | "CEILING_RAISE";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"APPROVE" | "REJECT" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passkeyUrl, setPasskeyUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState<{
    message: string;
    detail: string;
  } | null>(null);

  // `busy` deliberately stays set through the page refetch, so the button keeps
  // reading "Approving…" until the decision is actually reflected on screen.
  // Clearing it when the POST resolved re-enabled the control ~2.5s early,
  // inviting a second click on a decision that had already been taken.
  const [isPending, startTransition] = useTransition();
  const refreshing = useRef(false);

  useEffect(() => {
    if (refreshing.current && !isPending) {
      refreshing.current = false;
      setBusy(null);
    }
  }, [isPending]);

  function refresh() {
    refreshing.current = true;
    startTransition(() => router.refresh());
  }

  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(decision);
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
        setBusy(null);
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
          refresh();
          return;
        }

        if (!setup.ok) {
          setError(
            setupBody.error ?? "Could not open the mandate setup session.",
          );
          setBusy(null);
          return;
        }
        setPasskeyUrl(setupBody.approvalUrl ?? null);
        setBusy(null);
        return;
      }

      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  if (unavailable) {
    // Deliberately not styled as an error. Nothing failed: the system was asked
    // for authority it cannot create and declined to invent it.
    return (
      <Alert tone="warn" title={unavailable.message}>
        <p>{unavailable.detail}</p>
        <p className="text-label text-text-subtle mt-2">
          ceiling unchanged · no new authority granted
        </p>
      </Alert>
    );
  }

  if (passkeyUrl) {
    return (
      <Alert tone="info" title="Recorded. The ceiling has not moved.">
        <p>Complete the passkey ceremony to grant the new authority.</p>
        <ButtonLink
          variant="outline"
          size="sm"
          href={passkeyUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3"
        >
          Open passkey ceremony
          <ExternalLink aria-hidden />
        </ButtonLink>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={busy !== null || isPending}
          onClick={() => decide("APPROVE")}
        >
          {busy === "APPROVE"
            ? "Approving…"
            : type === "CEILING_RAISE"
              ? "Approve — needs a passkey"
              : "Approve"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={busy !== null || isPending}
          onClick={() => decide("REJECT")}
        >
          {busy === "REJECT" ? "Rejecting…" : "Reject"}
        </Button>
      </div>
      {error ? (
        <Alert tone="danger" title="The decision was not recorded." detail={error} />
      ) : null}
    </div>
  );
}
