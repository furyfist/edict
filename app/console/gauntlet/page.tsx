import { CORPUS, CORPUS_VERSION, externalEntries } from "@/lib/adversary";
import { latestRecord } from "@/lib/gauntlet";
import { listAdversarialEntries } from "@/lib/ledger";
import { DbUnavailable, PageHeader } from "../_components/page-header";
import { GauntletBoard } from "../_components/gauntlet-board";

export const dynamic = "force-dynamic";

/**
 * The Gauntlet — the Attack Console, promoted.
 *
 * The manual injection console still exists at /attack and nothing was deleted
 * from it. This is the surface for the standing measurement: a frozen corpus,
 * run unattended, producing a signed record.
 *
 * The difference between the two pages is the difference between an anecdote
 * and a number.
 */
export default async function GauntletPage() {
  let record: Awaited<ReturnType<typeof latestRecord>> = null;
  let adversarialEntries: Awaited<ReturnType<typeof listAdversarialEntries>> = [];
  let unavailable = false;

  try {
    [record, adversarialEntries] = await Promise.all([
      latestRecord(),
      listAdversarialEntries({ limit: 200 }),
    ]);
  } catch {
    unavailable = true;
  }

  return (
    <section>
      <PageHeader
        title="Gauntlet"
        question="Every defence in this architecture has attackers aimed at it. This is what happened when they ran."
      />

      {unavailable ? (
        <DbUnavailable />
      ) : (
        <>
          <div className="mt-6">
            <GauntletBoard
              corpusVersion={CORPUS_VERSION}
              corpusSize={externalEntries().length}
              initial={
                record
                  ? {
                      ranAt: record.ranAt.toISOString(),
                      attested: record.attested,
                      stale: record.stale,
                      subject: record.subject as never,
                    }
                  : null
              }
            />
          </div>

          <div className="mt-8">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              The corpus — {CORPUS.length} attacks, {CORPUS_VERSION}
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Every attacker names the defence it is aimed at. Operator-privilege
              attacks presuppose our own credentials and are demonstrated live on
              the Attack console rather than counted in the unattended run.
            </p>

            <ul className="mt-3 divide-y divide-neutral-800/80 border-y border-neutral-800/80">
              {CORPUS.map((entry) => (
                <li key={entry.id} className="py-2.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-400">
                      {entry.class.toLowerCase().replace(/_/g, " ")}
                    </span>
                    <span className="text-sm text-neutral-200">{entry.title}</span>
                    {entry.privilege === "OPERATOR" ? (
                      <span className="rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                        needs our credentials
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">{entry.intent}</p>
                  <p className="mt-0.5 text-[11px] text-neutral-600">
                    aimed at: {entry.targets}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          {adversarialEntries.length > 0 ? (
            <div className="mt-8">
              <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Adversarial ledger — {adversarialEntries.length} entries
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                Same chain as everything else, same signatures, same verifier.
                Tagged, not separated: one chain means an attacker cannot hide an
                edit between the two views.
              </p>

              <ul className="mt-3 divide-y divide-neutral-800/80 border-y border-neutral-800/80">
                {adversarialEntries.slice(-30).reverse().map(({ entry, attackId }) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2"
                  >
                    <span className="text-xs text-neutral-300">
                      {entry.vendorName}
                    </span>
                    <span className="text-[11px] uppercase tracking-wide text-neutral-500">
                      {entry.outcome.toLowerCase()}
                      {entry.refusalCode
                        ? ` · ${entry.refusalCode.toLowerCase().replace(/_/g, " ")}`
                        : ""}
                    </span>
                    <span className="font-mono text-[11px] text-neutral-600">
                      {attackId ?? "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
