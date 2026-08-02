import { ChevronDown } from "lucide-react";
import type { PresentedEntry } from "@/lib/ledger";
import { OutcomeBadge } from "./chips";
import { ModelOutput } from "./model-output";
import { PravaIdentifiers } from "./prava-identifiers";
import { ReceiptBadge, ReceiptDetail } from "./receipt-badge";
import { MonoId } from "./mono";
import { KeyValueGrid } from "@/app/_components/layout/key-value-grid";
import { EmptyState } from "@/app/_components/feedback/empty-state";
import { humanise } from "@/app/_lib/tone";

/**
 * The ledger, as a list.
 *
 * Each row states in one sentence what happened, to whom, for how much, and
 * which of the user's own words permitted it. Expanding reveals the evidence
 * and the four-actor attribution chain.
 *
 * ---------------------------------------------------------------------------
 * FIXED INFORMATION ORDER
 *
 * Every entry reads the same way, every time: OUTCOME → WHAT HAPPENED →
 * CONTEXT → THE SENTENCE THAT PERMITTED IT → then, on expand, IMPACT →
 * COUNTERFACTUAL → MODEL PROSE → ALTERNATIVE → EXECUTION IDS → ATTRIBUTION →
 * RECEIPT. Repetition across records makes scanning free; a reader who has
 * looked at three entries knows where the seventh keeps its digest.
 *
 * Machine-verified facts and model prose are kept visually separate, in
 * different type families and behind different borders. A reader must always be
 * able to tell which words a language model wrote — and separating it makes
 * everything around it more credible, not less.
 * ---------------------------------------------------------------------------
 *
 * Built on `<details>` deliberately: the disclosure works with no JavaScript,
 * which matters for a surface whose entire claim is that it can be inspected.
 */
export function EntryList({
  entries,
  emptyTitle,
  emptyDescription,
}: {
  entries: PresentedEntry[];
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        variant="no-data"
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {entries.map(({ entry, display, status }) => (
        <li key={entry.id}>
          <details className="group border-border bg-card rounded-lg border">
            <summary className="flex cursor-pointer list-none items-start gap-3 p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <span className="mt-0.5 shrink-0">
                <OutcomeBadge outcome={entry.outcome} />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-body text-foreground">{entry.explanation}</p>

                <div className="text-meta text-text-muted mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {display.chips.map((chip) => (
                    <span key={chip}>{chip}</span>
                  ))}
                </div>

                {display.citation ? (
                  <p className="text-meta text-text-muted mt-1.5 italic">
                    {display.citation}
                  </p>
                ) : null}

                {/* A verified receipt is the unremarkable case and earns no
                    chip. Only a receipt that changes what you should believe
                    is rendered. */}
                {status !== "VALID" ? (
                  <p className="mt-2">
                    <ReceiptBadge status={status} />
                  </p>
                ) : null}
              </div>

              <span className="text-meta text-text-subtle flex shrink-0 items-center gap-2 tabular-nums">
                {entry.clockAt.slice(0, 10)}
                <ChevronDown
                  className="size-3.5 transition-transform duration-[var(--duration-hover)] group-open:rotate-180"
                  aria-hidden
                />
              </span>
            </summary>

            <div className="border-border flex flex-col gap-6 border-t px-4 py-4">
              <div>
                <p className="text-body text-foreground">{display.impact}</p>
                <p className="text-meta text-text-muted mt-1">
                  {entry.counterfactual}
                </p>
              </div>

              {display.agentRationale ? (
                <ModelOutput>{display.agentRationale}</ModelOutput>
              ) : null}

              {entry.alternative ? (
                <div>
                  <p className="text-label text-text-subtle">also considered</p>
                  <p className="text-body text-text-muted mt-1">
                    {humanise(entry.alternative.action)} —{" "}
                    {entry.alternative.reason}
                  </p>
                </div>
              ) : null}

              {entry.executedBy ? (
                <PravaIdentifiers executedBy={entry.executedBy} />
              ) : null}

              <div>
                <p className="text-label text-text-subtle pb-3">attribution</p>
                <KeyValueGrid
                  items={display.attribution.map((line) => ({
                    label: line.role,
                    value: <MonoId value={line.value} label={line.role} />,
                  }))}
                />
              </div>

              {entry.error ? (
                <p className="text-mono text-danger break-words">
                  {entry.error.code}: {entry.error.message}
                </p>
              ) : null}

              <div>
                <p className="text-label text-text-subtle pb-3">receipt</p>
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
