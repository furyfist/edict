"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { OctagonX, Play } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { Input } from "@/app/_components/ui/field";
import { Alert } from "@/app/_components/feedback/alert";
import { Card } from "@/app/_components/ui/card";

/**
 * The kill switch.
 *
 * Typed confirmation to engage, one click to release. The asymmetry is
 * deliberate and it runs the opposite way to most tools: here the GUARDED path
 * is the one that stops the agent, because stopping it is the consequential,
 * fleet-wide act — but restoring authority is never accidental either, since it
 * is only reachable once the halted state is already on the screen.
 *
 * Only the dangerous direction gets a dialog. A toggle that confirms in both
 * directions teaches people to click through confirmations.
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
        // Not a toast. A mandate that could not be paused at Prava is an
        // unresolved consequence, and an unresolved consequence must not
        // disappear after four seconds.
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
      <div className="flex flex-col gap-3">
        <Alert tone="danger" title="Agent halted.">
          Every mandate is paused and the next tick will refuse to run.
        </Alert>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => send(false)}
          className="w-fit"
        >
          <Play aria-hidden />
          {busy ? "Restoring…" : "Restore authority"}
        </Button>
        {error ? <Alert tone="danger" title="Something failed." detail={error} /> : null}
      </div>
    );
  }

  return (
    <Card>
      {confirming ? (
        <>
          <p className="text-body text-foreground">
            Type <span className="text-mono text-danger">HALT</span> to pause
            every mandate and stop the agent.
          </p>
          <p className="text-meta text-text-muted mt-1.5">
            This pauses authority at Prava, not only in this application. The
            next tick will refuse to run.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              className="text-mono w-28"
              placeholder="HALT"
              aria-label="Type HALT to confirm"
              autoFocus
            />
            <Button
              variant="danger"
              size="sm"
              disabled={typed !== "HALT" || busy}
              title={
                typed !== "HALT"
                  ? "Type HALT exactly to enable this control."
                  : undefined
              }
              onClick={() => send(true)}
            >
              {busy ? "Halting…" : "Halt the agent"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirming(false);
                setTyped("");
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-card-title text-foreground">Kill switch</p>
          <p className="text-meta text-text-muted mt-1">
            Pauses every mandate at Prava and halts the next tick.
          </p>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setConfirming(true)}
            className="mt-3"
          >
            <OctagonX aria-hidden />
            Halt the agent
          </Button>
        </>
      )}

      {error ? (
        <Alert
          tone="danger"
          title="Something failed."
          detail={error}
          className="mt-3"
        />
      ) : null}
    </Card>
  );
}
