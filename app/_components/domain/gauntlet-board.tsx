"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Swords } from "lucide-react";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { Button } from "@/app/_components/ui/button";
import { Badge } from "@/app/_components/ui/badge";
import { Card } from "@/app/_components/ui/card";
import { Alert } from "@/app/_components/feedback/alert";
import { EmptyState } from "@/app/_components/feedback/empty-state";
import { StatGrid, StatTile } from "@/app/_components/layout/stat-tile";
import { Section } from "@/app/_components/layout/section";
import {
  TableFrame,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/app/_components/data/table";
import { VerdictChip } from "./chips";
import { MonoId } from "./mono";
import { humanise } from "@/app/_lib/tone";

/**
 * THE SCOREBOARD.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PAGE IS FOR, AND WHAT IT MUST NOT BECOME
 *
 * The runbook is explicit: do not explain corpus freezing, run contexts, or
 * claim envelopes on stage. Show the scoreboard and the file. The plumbing is
 * what the repository and the Q&A are for.
 *
 * So this renders three things and stops: what was attacked, what got through,
 * and whether the number can be trusted. Everything else is one click away.
 *
 * The column that matters is BREACHED, and it is rendered even when it is zero
 * — especially when it is zero. A column of zeroes that could have been
 * non-zero is the entire argument. It is toned green at zero and red above it,
 * which is the one place in this product where a zero is deliberately coloured:
 * here the absence IS the claim.
 * ---------------------------------------------------------------------------
 */

interface ClassTally {
  class: string;
  attempted: number;
  defended: number;
  breached: number;
  unexpected: number;
  skipped: number;
}

interface AttackResult {
  attackId: string;
  class: string;
  title: string;
  targets: string;
  privilege: string;
  verdict:
    | "DEFENDED"
    | "BREACHED"
    | "UNEXPECTED"
    | "NOT_APPLICABLE"
    | "NOT_ATTEMPTED";
  vendorName: string | null;
  outcome: string | null;
  refusalCode: string | null;
  chargedCents: number;
  reason: string | null;
}

interface Record_ {
  ranAt: string;
  attested: boolean;
  stale: boolean;
  subject: {
    corpusVersion: string;
    corpusDigest: string;
    attempted: number;
    defended: number;
    breached: number;
    unexpected: number;
    notApplicable: number;
    notAttempted: number;
    centsMovedOutsideAuthority: number;
    byClass: ClassTally[];
    results: AttackResult[];
    completeness: { status: string | null; unproven: boolean };
    matrix: {
      proposers: Array<{ name: string; available: boolean; reason: string | null }>;
      rows: Array<{
        proposer: string;
        attackId: string;
        vendorName: string;
        proposedCents: number;
        outcome: string;
        chargedCents: number;
        withinAuthority: boolean;
      }>;
      outsideAuthority: unknown[];
      sentence: string;
    } | null;
    headline: string;
  };
}

export function GauntletBoard({
  initial,
  corpusVersion,
  corpusSize,
}: {
  initial: Record_ | null;
  corpusVersion: string;
  corpusSize: number;
}) {
  const router = useRouter();
  const [record, setRecord] = useState<Record_ | null>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(limit?: number) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/gauntlet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(limit ? { limit } : {}),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? `Failed with status ${response.status}.`);
        return;
      }

      const fresh = await fetch("/api/gauntlet");
      const freshBody = await fresh.json().catch(() => ({}));
      setRecord(freshBody.record ?? null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const s = record?.subject;

  const controls = (
    <div className="flex flex-wrap gap-2">
      <Button variant="destructive" size="sm" disabled={busy} onClick={() => run(1)}>
        <Play aria-hidden />
        {busy ? "Running…" : "Run one attack live"}
      </Button>
      <Button variant="outline" size="sm" disabled={busy} onClick={() => run()}>
        <Swords aria-hidden />
        Run the whole corpus
      </Button>
    </div>
  );

  if (!s) {
    return (
      <div className="flex flex-col gap-3">
        <EmptyState
          variant="no-data"
          title="Nothing has been run"
          description={`The corpus holds ${corpusSize} attacks (${corpusVersion}), one or more aimed at every defence in the architecture. Until they run, this system makes no claim about surviving them.`}
          action={controls}
        />
        {error ? (
          <Alert tone="danger" title="The run could not start." detail={error} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={record?.attested ? "success" : "neutral"}>
              {record?.attested ? "attested" : "unattested"}
            </Badge>
            {record?.stale ? <Badge tone="warn">stale</Badge> : null}
          </div>
          {controls}
        </div>

        <StatGrid>
          <StatTile label="Attacks run" value={s.attempted} />
          <StatTile label="Defended" value={s.defended} tone="success" />
          {/* The column that matters. Rendered loudly at zero. */}
          <StatTile
            label="Breached"
            value={s.breached}
            tone={s.breached > 0 ? "danger" : "success"}
            caption={s.breached > 0 ? "authority was exceeded" : "none got through"}
          />
          <StatTile
            label="Cents moved"
            value={s.centsMovedOutsideAuthority}
            tone={s.centsMovedOutsideAuthority > 0 ? "danger" : "success"}
            caption="outside authority"
          />
        </StatGrid>

        <p className="text-body text-foreground mt-4">{s.headline}</p>

        {s.completeness.unproven ? (
          <Alert
            tone="warn"
            title="This record cannot make the strong claim."
            className="mt-3"
          >
            It depends on the books being provably complete at this ledger head,
            and they are not. Reconcile on the Authority page, then run again.
          </Alert>
        ) : null}

        <p className="text-meta text-text-muted mt-3 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>corpus</span>
          <span className="text-mono text-foreground">{s.corpusVersion}</span>
          <span>@</span>
          <MonoId value={s.corpusDigest} label="corpus digest" truncate={16} />
          {s.notApplicable + s.notAttempted > 0 ? (
            <span>
              · {s.notApplicable + s.notAttempted} not run in this environment,
              counted as neither pass nor fail
            </span>
          ) : null}
        </p>
      </div>

      <Section title="By attack class">
        <TableFrame isEmpty={s.byClass.length === 0} empty={null}>
          <THead>
            <TH>Attack class</TH>
            <TH className="text-right">Run</TH>
            <TH className="text-right">Defended</TH>
            <TH className="text-right">Breached</TH>
            <TH className="text-right">Unexpected</TH>
          </THead>
          <TBody>
            {s.byClass.map((t) => (
              <TR key={t.class}>
                <TD>{humanise(t.class)}</TD>
                <TD className="text-mono text-text-muted text-right tabular-nums">
                  {t.attempted}
                </TD>
                <TD className="text-mono text-success text-right tabular-nums">
                  {t.defended}
                </TD>
                <TD
                  className={`text-mono text-right tabular-nums ${
                    t.breached > 0 ? "text-danger" : "text-text-subtle"
                  }`}
                >
                  {t.breached}
                </TD>
                <TD
                  className={`text-mono text-right tabular-nums ${
                    t.unexpected > 0 ? "text-warn" : "text-text-subtle"
                  }`}
                >
                  {t.unexpected}
                </TD>
              </TR>
            ))}
          </TBody>
        </TableFrame>
      </Section>

      {/*
        The model matrix. A table, deliberately — "three proposers, identical
        bounds" is a good idea and a bad thirty seconds, so it lives below the
        scoreboard and answers a Q&A question rather than competing with the
        headline.
      */}
      {s.matrix && s.matrix.rows.length > 0 ? (
        <Section
          title="Same attacks, different proposers"
          description={s.matrix.sentence}
        >
          <TableFrame isEmpty={false} empty={null}>
            <THead>
              <TH>Proposer</TH>
              <TH>Vendor</TH>
              <TH className="text-right">Proposed</TH>
              <TH>Outcome</TH>
              <TH className="text-right">Charged</TH>
              <TH>Within authority</TH>
            </THead>
            <TBody>
              {s.matrix.rows.map((r, i) => (
                <TR key={`${r.proposer}-${r.attackId}-${i}`}>
                  <TD className="text-mono">{r.proposer}</TD>
                  <TD className="text-text-muted">{r.vendorName}</TD>
                  <TD className="text-mono text-text-muted text-right tabular-nums">
                    {formatCents(r.proposedCents as Cents)}
                  </TD>
                  <TD className="text-text-muted">{humanise(r.outcome)}</TD>
                  <TD className="text-mono text-text-muted text-right tabular-nums">
                    {formatCents(r.chargedCents as Cents)}
                  </TD>
                  {/* The invariant column. The only one that must be uniform,
                      and the only claim being made. */}
                  <TD>
                    <Badge tone={r.withinAuthority ? "success" : "danger"}>
                      {r.withinAuthority ? "yes" : "NO"}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </TableFrame>

          {s.matrix.proposers.some((p) => !p.available) ? (
            <Alert
              tone="warn"
              className="mt-3"
              title="A missing variant is reported, not skipped silently."
            >
              Not run:{" "}
              {s.matrix.proposers
                .filter((p) => !p.available)
                .map((p) => `${p.name} (${p.reason})`)
                .join(", ")}
              .
            </Alert>
          ) : null}
        </Section>
      ) : null}

      <Section title="Every attack">
        <ul className="flex flex-col gap-3">
          {s.results.map((r) => (
            <li key={r.attackId}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <VerdictChip verdict={r.verdict} />
                  <span className="text-card-title text-foreground">
                    {r.title}
                  </span>
                  {r.vendorName ? (
                    <span className="text-meta text-text-muted">
                      @{r.vendorName}
                    </span>
                  ) : null}
                </div>
                <p className="text-meta text-text-muted mt-1.5">
                  {r.reason ??
                    `${humanise(r.outcome ?? "")}${
                      r.refusalCode ? ` / ${humanise(r.refusalCode)}` : ""
                    }`}
                </p>
                <p className="text-meta text-text-subtle mt-1">
                  aimed at: {r.targets}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      </Section>

      {error ? (
        <Alert tone="danger" title="The run could not start." detail={error} />
      ) : null}
    </div>
  );
}
