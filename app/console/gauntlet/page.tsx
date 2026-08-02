import { CORPUS, CORPUS_VERSION, externalEntries } from "@/lib/adversary";
import { latestRecord } from "@/lib/gauntlet";
import { listAdversarialEntries } from "@/lib/ledger";
import { PageHeader } from "@/app/_components/layout/page-header";
import { PageSections, Section } from "@/app/_components/layout/section";
import { DbUnavailable } from "@/app/_components/feedback/alert";
import { Badge } from "@/app/_components/ui/badge";
import { Card } from "@/app/_components/ui/card";
import { GauntletBoard } from "@/app/_components/domain/gauntlet-board";
import { MonoId } from "@/app/_components/domain/mono";
import { humanise } from "@/app/_lib/tone";

export const dynamic = "force-dynamic";

/**
 * The Gauntlet — the Attack console, promoted.
 *
 * The manual injection console still exists at /console/attack and nothing was
 * deleted from it. This is the surface for the standing measurement: a frozen
 * corpus, run unattended, producing a signed record.
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
    <>
      <PageHeader
        title="Gauntlet"
        question="What happened when the attackers ran? Every defence in this architecture has attackers aimed at it."
      />

      {unavailable ? (
        <DbUnavailable />
      ) : (
        <PageSections>
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

          <Section
            title={`The corpus — ${CORPUS.length} attacks, ${CORPUS_VERSION}`}
            description="Every attacker names the defence it is aimed at. Operator-privilege attacks presuppose our own credentials and are demonstrated live on the Attack console rather than counted in the unattended run."
          >
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {CORPUS.map((entry) => (
                <li key={entry.id}>
                  <Card className="h-full">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{humanise(entry.class)}</Badge>
                      {entry.privilege === "OPERATOR" ? (
                        <Badge tone="medium">needs our credentials</Badge>
                      ) : null}
                    </div>
                    <p className="text-card-title text-foreground mt-2">
                      {entry.title}
                    </p>
                    <p className="text-meta text-text-muted mt-1.5">
                      {entry.intent}
                    </p>
                    <p className="text-meta text-text-subtle mt-1">
                      aimed at: {entry.targets}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          </Section>

          {adversarialEntries.length > 0 ? (
            <Section
              title={`Adversarial ledger — ${adversarialEntries.length} entries`}
              description="Same chain as everything else, same signatures, same verifier. Tagged, not separated: one chain means an attacker cannot hide an edit between the two views."
            >
              <ul className="flex flex-col">
                {adversarialEntries
                  .slice(-30)
                  .reverse()
                  .map(({ entry, attackId }) => (
                    <li
                      key={entry.id}
                      className="border-border flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b py-2.5 last:border-b-0"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="text-body text-foreground truncate">
                          {entry.vendorName}
                        </span>
                        <span className="text-meta text-text-muted">
                          {humanise(entry.outcome)}
                          {entry.refusalCode
                            ? ` · ${humanise(entry.refusalCode)}`
                            : ""}
                        </span>
                      </span>
                      <span className="shrink-0">
                        <MonoId value={attackId} label="attack id" />
                      </span>
                    </li>
                  ))}
              </ul>
            </Section>
          ) : null}
        </PageSections>
      )}
    </>
  );
}
