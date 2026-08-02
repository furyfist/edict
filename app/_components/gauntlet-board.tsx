"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";

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
 * non-zero is the entire argument.
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

const VERDICT_STYLE: Record<string, string> = {
  DEFENDED: "text-emerald-300",
  BREACHED: "text-rose-300",
  // Amber, not red. Authority held; a prediction missed.
  UNEXPECTED: "text-amber-300",
  NOT_APPLICABLE: "text-neutral-500",
  NOT_ATTEMPTED: "text-neutral-500",
};

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
  const breached = s?.breached ?? 0;

  return (
    <div>
      <div className="rounded border border-neutral-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-medium text-neutral-100">
              Adversarial record
            </h2>
            {record ? (
              <>
                <span
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                    record.attested
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : "border-neutral-700 text-neutral-400"
                  }`}
                >
                  {record.attested ? "attested" : "unattested"}
                </span>
                {record.stale ? (
                  <span className="rounded border border-amber-500/30 bg-amber-500/5 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200">
                    stale
                  </span>
                ) : null}
              </>
            ) : (
              <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                never run
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(1)}
              className="rounded border border-rose-500/40 bg-rose-500/10 px-2.5 py-1 text-xs text-rose-200 disabled:opacity-40"
            >
              {busy ? "running…" : "Run one attack live"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run()}
              className="rounded border border-neutral-600 px-2.5 py-1 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
            >
              Run the whole corpus
            </button>
          </div>
        </div>

        {s ? (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="attacks run" value={s.attempted} />
              <Stat label="defended" value={s.defended} tone="good" />
              {/* The column that matters. Rendered loudly at zero. */}
              <Stat label="breached" value={s.breached} tone={breached > 0 ? "bad" : "good"} />
              <Stat
                label="cents moved"
                value={s.centsMovedOutsideAuthority}
                tone={s.centsMovedOutsideAuthority > 0 ? "bad" : "good"}
              />
            </div>

            <p className="mt-3 text-xs leading-relaxed text-neutral-300">
              {s.headline}
            </p>

            {s.completeness.unproven ? (
              <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/5 p-2 text-[11px] text-amber-200">
                This record cannot make the strong claim: it depends on the books
                being provably complete at this ledger head, and they are not.
                Reconcile on the Authority page, then run again.
              </p>
            ) : null}

            <p className="mt-2 text-[11px] text-neutral-500">
              corpus{" "}
              <code className="text-neutral-400">{s.corpusVersion}</code> @{" "}
              <code className="text-neutral-400">
                {s.corpusDigest.slice(0, 16)}…
              </code>
              {s.notApplicable + s.notAttempted > 0 ? (
                <>
                  {" · "}
                  {s.notApplicable + s.notAttempted} not run in this environment,
                  counted as neither pass nor fail
                </>
              ) : null}
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-neutral-600">
                    <th className="py-1 font-medium">attack class</th>
                    <th className="py-1 font-medium">run</th>
                    <th className="py-1 font-medium">defended</th>
                    <th className="py-1 font-medium">breached</th>
                    <th className="py-1 font-medium">unexpected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/80">
                  {s.byClass.map((t) => (
                    <tr key={t.class}>
                      <td className="py-1.5 text-neutral-300">
                        {t.class.toLowerCase().replace(/_/g, " ")}
                      </td>
                      <td className="py-1.5 font-mono text-neutral-400">
                        {t.attempted}
                      </td>
                      <td className="py-1.5 font-mono text-emerald-300">
                        {t.defended}
                      </td>
                      <td
                        className={`py-1.5 font-mono ${
                          t.breached > 0 ? "text-rose-300" : "text-neutral-600"
                        }`}
                      >
                        {t.breached}
                      </td>
                      <td
                        className={`py-1.5 font-mono ${
                          t.unexpected > 0 ? "text-amber-300" : "text-neutral-600"
                        }`}
                      >
                        {t.unexpected}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/*
              The model matrix. A table, deliberately — "three proposers,
              identical bounds" is a good idea and a bad thirty seconds, so it
              lives below the scoreboard and answers a Q&A question rather than
              competing with the headline.
            */}
            {s.matrix && s.matrix.rows.length > 0 ? (
              <div className="mt-6 rounded border border-neutral-800 p-3">
                <h3 className="text-xs font-medium text-neutral-300">
                  Same attacks, different proposers
                </h3>
                <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
                  {s.matrix.sentence}
                </p>

                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[30rem] text-left text-[11px]">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-neutral-600">
                        <th className="py-1 font-medium">proposer</th>
                        <th className="py-1 font-medium">vendor</th>
                        <th className="py-1 font-medium">proposed</th>
                        <th className="py-1 font-medium">outcome</th>
                        <th className="py-1 font-medium">charged</th>
                        <th className="py-1 font-medium">within authority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/80">
                      {s.matrix.rows.map((r, i) => (
                        <tr key={`${r.proposer}-${r.attackId}-${i}`}>
                          <td className="py-1 font-mono text-neutral-300">
                            {r.proposer}
                          </td>
                          <td className="py-1 text-neutral-400">{r.vendorName}</td>
                          <td className="py-1 font-mono text-neutral-400">
                            {formatCents(r.proposedCents as Cents)}
                          </td>
                          <td className="py-1 text-neutral-400">
                            {r.outcome.toLowerCase()}
                          </td>
                          <td className="py-1 font-mono text-neutral-400">
                            {formatCents(r.chargedCents as Cents)}
                          </td>
                          {/* The invariant column. The only one that must be
                              uniform, and the only claim being made. */}
                          <td
                            className={`py-1 ${
                              r.withinAuthority ? "text-emerald-300" : "text-rose-300"
                            }`}
                          >
                            {r.withinAuthority ? "yes" : "NO"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {s.matrix.proposers.some((p) => !p.available) ? (
                  <p className="mt-2 text-[11px] text-amber-200">
                    Not run:{" "}
                    {s.matrix.proposers
                      .filter((p) => !p.available)
                      .map((p) => `${p.name} (${p.reason})`)
                      .join(", ")}
                    . A missing variant is reported, not skipped silently.
                  </p>
                ) : null}
              </div>
            ) : null}

            <ul className="mt-4 space-y-1.5">
              {s.results.map((r) => (
                <li
                  key={r.attackId}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"
                >
                  <span
                    className={`w-24 shrink-0 text-[10px] uppercase tracking-wide ${
                      VERDICT_STYLE[r.verdict] ?? "text-neutral-500"
                    }`}
                  >
                    {r.verdict.toLowerCase().replace(/_/g, " ")}
                  </span>
                  <span className="text-xs text-neutral-200">{r.title}</span>
                  {r.vendorName ? (
                    <span className="text-[11px] text-neutral-500">
                      @{r.vendorName}
                    </span>
                  ) : null}
                  <span className="text-[11px] text-neutral-500">
                    {r.reason ??
                      `${r.outcome}${r.refusalCode ? " / " + r.refusalCode : ""}`}
                  </span>
                  <span className="w-full text-[11px] text-neutral-600">
                    aimed at: {r.targets}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-3 text-xs text-neutral-400">
            The corpus holds {corpusSize} attacks ({corpusVersion}), one or more
            aimed at every defence in the architecture. Nothing has been run yet,
            so this system makes no claim about surviving them.
          </p>
        )}

        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "good" | "bad";
}) {
  const style =
    tone === "bad"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-300"
      : tone === "good"
        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
        : "border-neutral-800 text-neutral-300";

  return (
    <div className={`rounded border p-2.5 ${style}`}>
      <div className="font-mono text-lg leading-none">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-wide">{label}</div>
    </div>
  );
}
