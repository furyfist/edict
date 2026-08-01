import type { ExecutedBy } from "@/lib/contracts";

/**
 * Prava identifiers, displayed prominently.
 *
 * These are the strongest credibility moment available: a judge can open
 * Prava's own dashboard and find this exact charge. Everything else on screen
 * is our word for it — this is someone else's.
 *
 * Rendered in monospace and selectable, because the point is that someone
 * copies them out and checks.
 */
export function PravaIdentifiers({ executedBy }: { executedBy: ExecutedBy }) {
  return (
    <div className="rounded border border-emerald-500/25 bg-emerald-500/5 p-2.5">
      <p className="mb-1.5 text-[10px] uppercase tracking-wide text-emerald-300/70">
        verifiable in prava&apos;s dashboard
      </p>
      <dl className="grid gap-1">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-neutral-500">mandate</dt>
          <dd className="min-w-0 select-all break-all font-mono text-[11px] text-neutral-200">
            {executedBy.mandateId}
          </dd>
        </div>
        {executedBy.chargeId ? (
          <div className="flex gap-2">
            <dt className="w-20 shrink-0 text-neutral-500">charge</dt>
            <dd className="min-w-0 select-all break-all font-mono text-[11px] text-neutral-200">
              {executedBy.chargeId}
            </dd>
          </div>
        ) : null}
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-neutral-500">status</dt>
          <dd className="font-mono text-[11px] text-neutral-300">
            {executedBy.status}
          </dd>
        </div>
      </dl>
    </div>
  );
}
