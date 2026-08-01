"use client";

import { useState } from "react";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";

/**
 * "What did that edit actually change?"
 *
 * Deliberately a click, not a page load. The answer costs evidence reads and
 * almost nobody wants it on arrival — but the person who does want it is asking
 * the sharpest question available about a policy edit, and they should get a
 * real answer rather than a text diff.
 */

interface Side {
  effect: string;
  matchedRuleOrdinal: number;
  matchedSourceFragment: string;
}

interface Change {
  scenarioId: string;
  origin: "history" | "synthetic";
  vendorName: string;
  amountCents: number;
  before: Side;
  after: Side;
}

interface Diff {
  fromVersion: number;
  toVersion: number;
  scenarioCount: number;
  summary: {
    gainedAutonomy: number;
    lostAutonomy: number;
    newlyRefused: number;
    otherChanges: number;
    unchanged: number;
  };
  changes: Change[];
}

const EFFECT_WORD: Record<string, string> = {
  ALLOW_AUTO: "auto-executes",
  REQUIRE_APPROVAL: "asks you",
  DENY: "refuses",
};

export function VersionDiff({
  fromId,
  toId,
  label,
}: {
  fromId: string;
  toId: string;
  label: string;
}) {
  const [diff, setDiff] = useState<Diff | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/policy/diff?from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`,
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error ?? `Failed with status ${response.status}.`);
        return;
      }
      setDiff(body.diff);
    } finally {
      setBusy(false);
    }
  }

  if (!diff) {
    return (
      <div>
        <button
          type="button"
          disabled={busy}
          onClick={load}
          className="text-[11px] text-neutral-500 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300 disabled:opacity-40"
        >
          {busy ? "replaying…" : label}
        </button>
        {error ? <p className="mt-1 text-[11px] text-rose-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="mt-2 rounded border border-neutral-800 p-3">
      <p className="text-xs text-neutral-300">
        v{diff.fromVersion} → v{diff.toVersion}, replayed over {diff.scenarioCount}{" "}
        scenarios.
      </p>

      <p className="mt-1 text-xs text-neutral-400">
        {diff.summary.gainedAutonomy === 0 && diff.summary.lostAutonomy === 0 ? (
          "No scenario changed hands. This edit moved no authority."
        ) : (
          <>
            <span className="text-emerald-300">
              {diff.summary.gainedAutonomy} became automatic
            </span>
            {" · "}
            <span className="text-sky-300">
              {diff.summary.lostAutonomy} stopped being automatic
            </span>
            {diff.summary.newlyRefused > 0 ? (
              <>
                {" · "}
                <span className="text-rose-300">
                  {diff.summary.newlyRefused} newly refused
                </span>
              </>
            ) : null}
          </>
        )}
      </p>

      {diff.changes.length > 0 ? (
        <ul className="mt-2 divide-y divide-neutral-800/80">
          {diff.changes.map((change) => (
            <li key={change.scenarioId} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
              <span className="text-xs text-neutral-200">{change.vendorName}</span>
              <span className="font-mono text-xs text-neutral-400">
                {formatCents(change.amountCents as Cents)}
              </span>
              {change.origin === "synthetic" ? (
                <span className="rounded border border-neutral-700 px-1 py-0.5 text-[9px] uppercase tracking-wide text-neutral-500">
                  hypothetical
                </span>
              ) : null}
              <span className="text-[11px] text-neutral-500">
                {EFFECT_WORD[change.before.effect] ?? change.before.effect} →{" "}
                <span className="text-neutral-300">
                  {EFFECT_WORD[change.after.effect] ?? change.after.effect}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
