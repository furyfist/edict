import { listVersions } from "@/lib/policy/versions";
import { activationFor } from "@/lib/policy/activation";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { PageHeader } from "@/app/_components/layout/page-header";
import { PageSections, Section } from "@/app/_components/layout/section";
import { KeyValueGrid } from "@/app/_components/layout/key-value-grid";
import { DbUnavailable } from "@/app/_components/feedback/alert";
import { EmptyState } from "@/app/_components/feedback/empty-state";
import { Card } from "@/app/_components/ui/card";
import { Badge } from "@/app/_components/ui/badge";
import { EffectChip } from "@/app/_components/domain/chips";
import { MonoId } from "@/app/_components/domain/mono";
import { PolicyComposer } from "@/app/_components/domain/policy-composer";
import { VersionDiff } from "@/app/_components/domain/version-diff";

export const dynamic = "force-dynamic";

type Rule = {
  id: string;
  ordinal: number;
  effect: string;
  scopeKind: string;
  scopeVendorId: string | null;
  scopeCategory: string | null;
  maxAmountCents: number | null;
  minActiveSeatPct: number | null;
  frequency: string | null;
  renewalWithinDays: number | null;
  sourceFragment: string;
};

function conditionSummary(rule: Rule): string {
  const parts: string[] = [];
  if (rule.maxAmountCents !== null) {
    parts.push(`up to ${formatCents(rule.maxAmountCents as Cents)}`);
  }
  if (rule.minActiveSeatPct !== null) {
    parts.push(`usage above ${rule.minActiveSeatPct}%`);
  }
  if (rule.frequency !== null) parts.push(rule.frequency.toLowerCase());
  if (rule.renewalWithinDays !== null) {
    parts.push(`within ${rule.renewalWithinDays}d of renewal`);
  }
  return parts.length > 0 ? parts.join(" · ") : "no conditions";
}

function scopeSummary(rule: Rule): string {
  if (rule.scopeKind === "VENDOR") return "one vendor";
  if (rule.scopeKind === "CATEGORY") return `category: ${rule.scopeCategory}`;
  return "everything";
}

/**
 * Policy — where authority comes from.
 *
 * The user's English on one side, the rules it compiled into on the other, each
 * rule quoting the exact span it came from. Every enforcement in this product
 * traces back to words a human actually wrote, and this page is where that
 * claim is verifiable rather than merely asserted.
 *
 * The two columns ARE the argument, which is why they are a two-column grid at
 * `md` and a stack below it. A rule and the sentence it came from have to be
 * readable together at any width.
 */
export default async function PolicyPage() {
  let versions: Array<{
    id: string;
    version: number;
    englishText: string;
    status: string;
    activatedAt: Date | null;
    rules: Rule[];
  }> = [];
  let unavailable = false;

  try {
    versions = (await listVersions()) as typeof versions;
  } catch {
    unavailable = true;
  }

  const active = versions.find((version) => version.status === "ACTIVE");
  const others = versions.filter((version) => version.status !== "ACTIVE");

  // The activation record for the policy in force. Absent for versions
  // activated before records existed — rendered as absent, never as unproven.
  const activation = active && !unavailable ? await activationFor(active.id) : null;
  const activationSubject = activation?.subject as
    | {
        previewDigest?: string | null;
        scenarioCount?: number | null;
        counts?: Record<string, number> | null;
      }
    | null
    | undefined;

  return (
    <>
      <PageHeader
        title="Policy"
        question="Where does the agent's authority come from? Your words on one side, the rules they compiled into on the other — nothing enforces anything it cannot quote."
      />

      {unavailable ? (
        <DbUnavailable />
      ) : (
        <PageSections>
          <Section
            title="Compose"
            description="English becomes rules, the rules are rehearsed against your real book, and only then can they be granted. Compiling grants nothing."
          >
            <Card>
              <PolicyComposer initialText={active?.englishText ?? ""} />
            </Card>
          </Section>

          {!active ? (
            <EmptyState
              variant="no-data"
              title="No active policy"
              description="The agent halts until one is activated. Write a sentence above, read what it would do, and grant it."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
                <Section title={`What you wrote — version ${active.version}`}>
                  <blockquote className="border-accent text-body text-foreground border-l-2 pl-4 leading-7">
                    {active.englishText}
                  </blockquote>

                  {/*
                    The activation record. Three states, never two: attested,
                    written but unsigned, and absent. An activation with no
                    record is not a suspicious activation — it is one that
                    predates records, and saying so is cheaper than implying
                    otherwise.
                  */}
                  {activation ? (
                    <Card className="mt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          tone={activation.receiptSignature ? "success" : "neutral"}
                        >
                          {activation.receiptSignature ? "attested" : "unattested"}
                        </Badge>
                        <span className="text-meta text-text-muted">
                          activation record
                        </span>
                      </div>

                      <p className="text-meta text-text-muted mt-2">
                        {activationSubject?.previewDigest
                          ? `Granted after a preview of ${activationSubject.scenarioCount} scenarios was shown. The preview hash and the ledger head at that moment are inside the signature.`
                          : "Granted without a preview. Nothing proves what was shown before this authority was created."}
                      </p>

                      <KeyValueGrid
                        className="mt-3"
                        items={[
                          ...(activationSubject?.previewDigest
                            ? [
                                {
                                  label: "preview",
                                  value: (
                                    <MonoId
                                      value={activationSubject.previewDigest}
                                      label="preview digest"
                                      truncate={24}
                                    />
                                  ),
                                },
                              ]
                            : []),
                          {
                            label: "anchor",
                            value: (
                              <MonoId
                                value={activation.ledgerHead}
                                label="ledger head"
                                truncate={24}
                              />
                            ),
                          },
                        ]}
                      />
                    </Card>
                  ) : (
                    <p className="text-meta text-text-subtle mt-4">
                      No activation record — this version was activated before
                      records existed.
                    </p>
                  )}
                </Section>

                <Section
                  title="What it enforces"
                  description="Each rule quotes the exact span of your sentence it came from."
                >
                  <ol className="flex flex-col gap-3">
                    {active.rules.map((rule) => (
                      <li
                        key={rule.id}
                        className="border-border bg-card rounded-lg border p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-mono text-text-subtle">
                            {rule.ordinal}
                          </span>
                          <EffectChip effect={rule.effect} />
                          <span className="text-meta text-text-muted">
                            {scopeSummary(rule)}
                          </span>
                        </div>

                        <p className="text-meta text-text-muted mt-2">
                          {conditionSummary(rule)}
                        </p>

                        <p className="text-body text-foreground mt-2 italic">
                          &ldquo;{rule.sourceFragment}&rdquo;
                        </p>
                      </li>
                    ))}
                  </ol>
                </Section>
              </div>

              {others.length > 0 ? (
                <Section
                  title="Version history"
                  description="The question a person has about an old version is always the same one: what is different now?"
                >
                  <ul className="flex flex-col gap-3">
                    {others.map((version) => (
                      <li
                        key={version.id}
                        className="border-border bg-card rounded-lg border p-4"
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-3">
                          <span className="text-body text-text-muted min-w-0 truncate">
                            v{version.version} ·{" "}
                            {version.englishText.slice(0, 90)}
                            {version.englishText.length > 90 ? "…" : ""}
                          </span>
                          <Badge tone="neutral">
                            {version.status.toLowerCase()}
                          </Badge>
                        </div>

                        <VersionDiff
                          fromId={version.id}
                          toId={active.id}
                          label={`What changed between v${version.version} and v${active.version}?`}
                        />
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </>
          )}
        </PageSections>
      )}
    </>
  );
}
