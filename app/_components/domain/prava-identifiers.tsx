import { ExternalLink } from "lucide-react";
import type { ExecutedBy } from "@/lib/contracts";
import { KeyValueGrid } from "@/app/_components/layout/key-value-grid";
import { MonoId } from "./mono";

/**
 * Prava identifiers, displayed prominently.
 *
 * These are the strongest credibility moment available: a reader can open
 * Prava's own dashboard and find this exact charge. Everything else on screen is
 * our word for it — this is someone else's.
 *
 * Rendered in monospace, selectable, and with a copy control on every value,
 * because the point is that somebody copies them out and checks. An identifier
 * nobody can lift off the screen is decoration.
 */
export function PravaIdentifiers({ executedBy }: { executedBy: ExecutedBy }) {
  return (
    <div className="border-risk-low/40 bg-risk-low-bg rounded-md border p-3">
      <p className="text-label text-risk-low flex items-center gap-1.5">
        <ExternalLink className="size-3" aria-hidden />
        verifiable in Prava&apos;s dashboard
      </p>

      <KeyValueGrid
        className="mt-3"
        items={[
          {
            label: "mandate",
            value: <MonoId value={executedBy.mandateId} label="mandate id" />,
          },
          {
            label: "charge",
            value: <MonoId value={executedBy.chargeId} label="charge id" />,
          },
          { label: "status", value: executedBy.status, mono: true },
        ]}
      />
    </div>
  );
}
