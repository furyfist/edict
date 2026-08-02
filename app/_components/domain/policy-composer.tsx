"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { Button } from "@/app/_components/ui/button";
import { Label, Textarea } from "@/app/_components/ui/field";
import { Alert } from "@/app/_components/feedback/alert";
import { Dialog } from "@/app/_components/feedback/dialog";
import { StatTile } from "@/app/_components/layout/stat-tile";
import { HypotheticalChip } from "./chips";
import { effectTone } from "@/app/_lib/tone";

/**
 * WHERE AUTHORITY IS BORN.
 *
 * ---------------------------------------------------------------------------
 * THE MOMENT THIS COMPONENT GOVERNS
 *
 * Everything else in this product is accountability after the fact. This is the
 * one surface that acts BEFORE anything is granted, and it is the only place in
 * the system where a person can still change their mind for free.
 *
 * So it does three things in a fixed order and never collapses them:
 *
 *   1. compile   English becomes rules. Inert. Governs nothing.
 *   2. preview   Those rules are rehearsed against every renewal on the books
 *                and every boundary case, and the outcomes are shown.
 *   3. confirm   A human, having seen 2, grants the authority.
 *
 * A compile that activated would put a language model in the authorization
 * path. A confirm without a preview would be consent to a sentence rather than
 * to its consequences. Both are one refactor away at all times, which is why
 * the order is stated here in prose as well as enforced in code.
 * ---------------------------------------------------------------------------
 */

type Effect = "ALLOW_AUTO" | "REQUIRE_APPROVAL" | "DENY";

interface PreviewRow {
  scenarioId: string;
  label: string;
  origin: "history" | "synthetic";
  note: string | null;
  vendorName: string;
  amountCents: number;
  effect: Effect;
  code: string;
  matchedRuleOrdinal: number;
  matchedSourceFragment: string;
}

interface Preview {
  batteryVersion: string;
  policyVersion: number;
  scenarioCount: number;
  counts: Record<Effect, number>;
  rows: PreviewRow[];
}

interface Draft {
  englishText: string;
  rules: Array<{ ordinal: number; effect: string; sourceFragment: string }>;
  unsupportedClauses: string[];
}

interface Compiled {
  policyVersionId: string;
  draft: Draft;
  preview: Preview | null;
  previewDigest: string | null;
}

/**
 * Why the engine stopped, when it stopped before reaching the user's rules.
 *
 * The engine cites a synthetic guard rule with ordinal -1 for structural
 * checks, precisely so a reader can tell "your policy said no" from "the system
 * would not have got that far." Rendering that as `rule -1` would throw away
 * the distinction the engine went to the trouble of preserving.
 */
const GUARD_REASON: Record<string, string> = {
  OVER_MANDATE_CEILING: "over the mandate ceiling — needs a passkey, not a policy",
  EVIDENCE_INCOMPLETE: "evidence incomplete — unknown is never permission",
  MANDATE_NOT_CHARGEABLE: "the mandate cannot be charged",
  NO_MANDATE: "no mandate — outside the agent's authority entirely",
  MALFORMED_PROPOSAL: "malformed proposal — refused, not interpreted",
  UNSUPPORTED_CURRENCY: "unsupported currency",
};

const GROUPS: Array<{ effect: Effect; heading: string; blurb: string }> = [
  {
    effect: "ALLOW_AUTO",
    heading: "would auto-execute",
    blurb: "Charged without asking you. This is the authority you are granting.",
  },
  {
    effect: "REQUIRE_APPROVAL",
    heading: "would come to you",
    blurb: "Stopped and escalated. Nothing moves until you decide.",
  },
  {
    effect: "DENY",
    heading: "would refuse",
    blurb: "Refused outright, citing the sentence that forbids it.",
  },
];

function PreviewTable({ rows }: { rows: PreviewRow[] }) {
  const [showAll, setShowAll] = useState(false);

  const real = rows.filter((row) => row.origin === "history");
  const synthetic = rows.filter((row) => row.origin === "synthetic");
  const shown = showAll ? [...real, ...synthetic] : real;

  if (rows.length === 0) {
    return (
      <p className="text-meta text-text-subtle mt-2">Nothing lands here.</p>
    );
  }

  return (
    <div className="mt-2">
      <ul className="flex flex-col">
        {shown.map((row) => (
          <li
            key={row.scenarioId}
            className="border-border flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b py-2 last:border-b-0"
          >
            <span className="text-body-strong text-foreground">
              {row.vendorName}
            </span>
            <span className="text-mono text-text-muted tabular-nums">
              {formatCents(row.amountCents as Cents)}
            </span>
            {row.origin === "synthetic" ? <HypotheticalChip /> : null}
            <span className="text-meta text-text-muted">
              {row.matchedRuleOrdinal >= 0 ? (
                <>
                  rule {row.matchedRuleOrdinal} · &ldquo;
                  {row.matchedSourceFragment}&rdquo;
                </>
              ) : (
                <>
                  engine check ·{" "}
                  {GUARD_REASON[row.code] ??
                    row.code.toLowerCase().replace(/_/g, " ")}
                </>
              )}
            </span>
            {row.note ? (
              <span className="text-meta text-text-subtle w-full">
                {row.note}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      {synthetic.length > 0 ? (
        <Button
          variant="link"
          size="sm"
          className="mt-1.5 px-0"
          onClick={() => setShowAll((value) => !value)}
        >
          {showAll
            ? "Hide the hypotheticals"
            : `Show ${synthetic.length} hypothetical ${
                synthetic.length === 1 ? "case" : "cases"
              }`}
        </Button>
      ) : null}
    </div>
  );
}

function ConfirmDialog({
  compiled,
  onCancel,
  onConfirm,
  busy,
  error,
}: {
  compiled: Compiled;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { preview } = compiled;

  return (
    <Dialog
      open
      size="lg"
      // Escape and the scrim are inert mid-activation. Dismissing the dialog
      // while the grant is in flight would leave the reader unsure whether it
      // went through.
      onClose={busy ? () => {} : onCancel}
      title="Before you grant this"
      description="Nothing has been granted yet. Below is what these rules would have done, replayed against every renewal currently on your books and against the boundary cases your history does not contain."
      footer={
        <>
          <span className="text-meta text-text-muted sm:mr-auto">
            Activating changes what the agent may propose. It does not move any
            ceiling — that takes a passkey.
          </span>
          <Button variant="outline" size="sm" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy} onClick={onConfirm}>
            {busy ? "Activating…" : "I have read this — activate"}
          </Button>
        </>
      }
    >
      {preview ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {GROUPS.map((group) => (
              <StatTile
                key={group.effect}
                label={group.heading}
                value={preview.counts[group.effect]}
                tone={
                  preview.counts[group.effect] ? effectTone(group.effect) : "neutral"
                }
              />
            ))}
          </div>

          <div className="flex flex-col gap-6">
            {GROUPS.map((group) => (
              <section key={group.effect}>
                <h3 className="text-card-title text-foreground">
                  {group.heading}
                </h3>
                <p className="text-meta text-text-muted mt-0.5">{group.blurb}</p>
                <PreviewTable
                  rows={preview.rows.filter((row) => row.effect === group.effect)}
                />
              </section>
            ))}
          </div>

          <p className="border-border text-meta text-text-muted border-t pt-3">
            {preview.scenarioCount} scenarios, battery{" "}
            <code className="text-mono text-foreground">
              {preview.batteryVersion}
            </code>
            . Rows marked <em>hypothetical</em> did not happen — they are
            constructed boundary cases, not history, and no model proposed them.
            Confirming records that you saw this exact preview.
          </p>
        </>
      ) : (
        // Never render an empty preview as if it were an empty result. "This
        // policy does nothing" and "we could not work out what it does" are
        // different facts and only one of them is safe to confirm past.
        <Alert tone="warn" title="The preview could not be computed.">
          The rules above are valid and this policy is still inert. You can
          confirm without a preview, but nothing will be able to prove afterwards
          that you saw what it would do.
        </Alert>
      )}

      {error ? (
        <Alert tone="danger" title="Activation failed." detail={error} />
      ) : null}
    </Dialog>
  );
}

export function PolicyComposer({ initialText }: { initialText: string }) {
  const router = useRouter();

  const [text, setText] = useState(initialText);
  const [compiling, setCompiling] = useState(false);
  const [activating, setActivating] = useState(false);
  const [compiled, setCompiled] = useState<Compiled | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [modalError, setModalError] = useState<string | null>(null);

  async function compile() {
    setCompiling(true);
    setErrors([]);
    setCompiled(null);
    try {
      const response = await fetch("/api/policy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ englishText: text }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        // A policy that will not compile is a normal outcome shown to the user,
        // and the rejection shows its work rather than just saying no.
        setErrors(
          Array.isArray(body.errors) && body.errors.length > 0
            ? body.errors.map((error: { clause?: string; message: string }) =>
                error.clause ? `${error.message} — “${error.clause}”` : error.message,
              )
            : [body.error ?? `Compile failed with status ${response.status}.`],
        );
        return;
      }

      setCompiled({
        policyVersionId: body.policyVersionId,
        draft: body.draft,
        preview: body.preview ?? null,
        previewDigest: body.previewDigest ?? null,
      });
    } catch (error) {
      setErrors([error instanceof Error ? error.message : "Compile failed."]);
    } finally {
      setCompiling(false);
    }
  }

  // ---------------------------------------------------------------------
  // The dialog stays open, reading "Activating…", until the refetched page
  // actually shows the new policy.
  //
  // Closing it the moment the POST resolved dropped the reader back onto a
  // page still displaying the OLD active version for ~2.5s — the single worst
  // place in this product to imply nothing happened, because the whole point
  // of the confirm step is that granting authority is a deliberate act with a
  // visible result.
  // ---------------------------------------------------------------------
  const [isPending, startTransition] = useTransition();
  const refreshing = useRef(false);
  const committing = activating || isPending;

  useEffect(() => {
    if (refreshing.current && !isPending) {
      refreshing.current = false;
      setActivating(false);
      setCompiled(null);
    }
  }, [isPending]);

  async function activate() {
    if (!compiled) return;
    setActivating(true);
    setModalError(null);
    try {
      const response = await fetch("/api/policy/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          policyVersionId: compiled.policyVersionId,
          // The digest of the preview THIS person saw. The server rebuilds the
          // preview and refuses the activation if the two disagree, so the
          // record cannot claim a preview nobody was shown.
          previewDigest: compiled.previewDigest,
        }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setModalError(
          body.error ?? `Activation failed with status ${response.status}.`,
        );
        setActivating(false);
        return;
      }

      refreshing.current = true;
      startTransition(() => router.refresh());
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
      setActivating(false);
    }
  }

  return (
    <div>
      <Label htmlFor="policy-text">Write it in English</Label>
      <Textarea
        id="policy-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        spellCheck={false}
        className="mt-1.5"
        placeholder="Never auto-renew Vercel. Auto-renew anything under $500 a month. Anything over $500 a month needs my approval."
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          disabled={compiling || text.trim().length === 0}
          onClick={compile}
        >
          {compiling ? "Compiling…" : "Compile"}
        </Button>
        <span className="text-meta text-text-muted">
          Compiling grants nothing. You will see what it would do before you
          decide.
        </span>
      </div>

      {errors.length > 0 ? (
        <Alert
          tone="danger"
          title="This policy will not compile."
          className="mt-4"
        >
          <ul className="flex flex-col gap-1">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      {compiled ? (
        <ConfirmDialog
          compiled={compiled}
          busy={committing}
          error={modalError}
          onCancel={() => setCompiled(null)}
          onConfirm={activate}
        />
      ) : null}
    </div>
  );
}
