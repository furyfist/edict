import type { PresentedEntry } from "@/lib/ledger";
import { OutcomeBadge } from "./outcome-badge";
import { PravaIdentifiers } from "./prava-identifiers";
import { ReceiptBadge, ReceiptDetail } from "./receipt-badge";

/**
 * The ledger, as a list.
 *
 * Each row states in one sentence what happened, to whom, for how much, and
 * which of the user's own words permitted it. Expanding reveals the evidence
 * and the four-actor attribution chain.
 *
 * Machine-verified facts and model prose are kept visually separate. The
 * agent's rationale sits in its own labeled block, because a reader must always
 * be able to tell which words a language model wrote — and separating it makes
 * everything around it more credible, not less.
 */
export function EntryList({ entries }: { entries: PresentedEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="mt-4 text-sm text-neutral-500">
        Nothing recorded yet. Run a tick to see the agent work.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-neutral-800/80 border-y border-neutral-800/80">
      {entries.map(({ entry, display, status }) => (
        <li key={entry.id} className="py-4">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-start gap-3">
              <OutcomeBadge outcome={entry.outcome} />

              <div className="min-w-0 flex-1">
                <p className="text-sm leading-snug text-neutral-100">
                  {entry.explanation}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500">
                  {display.chips.map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>

                {display.citation ? (
                  <p className="mt-1.5 text-xs italic text-neutral-400">
                    {display.citation}
                  </p>
                ) : null}

                {status !== "VALID" ? (
                  <p className="mt-1.5">
                    <ReceiptBadge status={status} />
                  </p>
                ) : null}
              </div>

              <span className="shrink-0 text-xs text-neutral-600 transition-colors group-open:text-neutral-400">
                {entry.clockAt.slice(0, 10)}
              </span>
            </summary>

            <div className="mt-4 space-y-4 border-l border-neutral-800 pl-4 text-xs">
              <div className="space-y-1">
                <p className="text-neutral-300">{display.impact}</p>
                <p className="text-neutral-500">{entry.counterfactual}</p>
              </div>

              {display.agentRationale ? (
                <div className="rounded border border-dashed border-neutral-700 p-2.5">
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-neutral-500">
                    agent&apos;s stated reasoning — model output
                  </p>
                  <p className="text-neutral-300">{display.agentRationale}</p>
                </div>
              ) : null}

              {entry.alternative ? (
                <p className="text-neutral-400">
                  <span className="text-neutral-500">also considered: </span>
                  {entry.alternative.action.toLowerCase().replace(/_/g, " ")} —{" "}
                  {entry.alternative.reason}
                </p>
              ) : null}

              {entry.executedBy ? (
                <PravaIdentifiers executedBy={entry.executedBy} />
              ) : null}

              <dl className="grid gap-1">
                {display.attribution.map((line) => (
                  <div key={line.role} className="flex gap-2">
                    <dt className="w-28 shrink-0 text-neutral-500">{line.role}</dt>
                    <dd className="min-w-0 break-all font-mono text-[11px] text-neutral-300">
                      {line.value}
                    </dd>
                  </div>
                ))}
              </dl>

              {entry.error ? (
                <p className="font-mono text-[11px] text-rose-300/80">
                  {entry.error.code}: {entry.error.message}
                </p>
              ) : null}

              <div className="border-t border-neutral-800/80 pt-3">
                <p className="mb-1.5 text-[10px] uppercase tracking-wide text-neutral-500">
                  receipt
                </p>
                <ReceiptDetail
                  status={status}
                  receipt={entry.receipt}
                  entryId={entry.id}
                />
              </div>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}
