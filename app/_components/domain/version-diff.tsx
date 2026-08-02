"use client";

import { useState } from "react";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { Button } from "@/app/_components/ui/button";
import { Alert } from "@/app/_components/feedback/alert";
import { HypotheticalChip } from "./chips";

/**
 * "What did that edit actually change?"
 *
 * Deliberately a click, not a page load. The answer costs evidence reads and
 * almost nobody wants it on arrival — but the person who does want it is asking
 * the sharpest question available about a policy edit, and they should get a
 * real answer rather than a text diff.
 *
 * The summary is toned only where something moved. An edit that changed no
 * scenario's outcome renders one grey sentence, because "this edit moved no
 * authority" is a reassuring result and colouring it would imply otherwise.
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
        <Button
          variant="link"
          size="sm"
          disabled={busy}
          onClick={load}
          className="px-0"
        >
          {busy ? "Replaying…" : label}
        </Button>
        {error ? (
          <Alert
            tone="danger"
            title="The replay could not run."
            detail={error}
            className="mt-2"
          />
        ) : null}
      </div>
    );
  }

  const moved =
    diff.summary.gainedAutonomy > 0 || diff.summary.lostAutonomy > 0;

  return (
    <div className="border-border bg-card mt-2 rounded-md border p-3">
      <p className="text-body-strong text-foreground">
        v{diff.fromVersion} → v{diff.toVersion}, replayed over{" "}
        {diff.scenarioCount} scenarios.
      </p>

      <p className="text-meta mt-1">
        {!moved ? (
          <span className="text-text-muted">
            No scenario changed hands. This edit moved no authority.
          </span>
        ) : (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-success">
              {diff.summary.gainedAutonomy} became automatic
            </span>
            <span className="text-text-subtle">·</span>
            <span className="text-info">
              {diff.summary.lostAutonomy} stopped being automatic
            </span>
            {diff.summary.newlyRefused > 0 ? (
              <>
                <span className="text-text-subtle">·</span>
                <span className="text-danger">
                  {diff.summary.newlyRefused} newly refused
                </span>
              </>
            ) : null}
          </span>
        )}
      </p>

      {diff.changes.length > 0 ? (
        <ul className="mt-3 flex flex-col">
          {diff.changes.map((change) => (
            <li
              key={change.scenarioId}
              className="border-border flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b py-2 last:border-b-0"
            >
              <span className="text-body-strong text-foreground">
                {change.vendorName}
              </span>
              <span className="text-mono text-text-muted tabular-nums">
                {formatCents(change.amountCents as Cents)}
              </span>
              {change.origin === "synthetic" ? <HypotheticalChip /> : null}
              <span className="text-meta text-text-muted">
                {EFFECT_WORD[change.before.effect] ?? change.before.effect} →{" "}
                <span className="text-foreground">
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
