"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";

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
 * A compile that activated would put a language model in the authorization path.
 * A confirm without a preview would be consent to a sentence rather than to its
 * consequences. Both are one refactor away at all times, which is why the order
 * is stated here in prose as well as enforced in code.
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
  rules: Array<{
    ordinal: number;
    effect: string;
    sourceFragment: string;
  }>;
  unsupportedClauses: string[];
}

interface Compiled {
  policyVersionId: string;
  draft: Draft;
  preview: Preview | null;
  previewDigest: string | null;
}

const EFFECT_STYLE: Record<Effect, string> = {
  DENY: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  REQUIRE_APPROVAL: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  ALLOW_AUTO: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
};

/**
 * Why the engine stopped, when it stopped before reaching the user's rules.
 *
 * The engine cites a synthetic guard rule with ordinal -1 for structural checks,
 * precisely so a reader can tell "your policy said no" from "the system would
 * not have got that far." Rendering that as `rule -1` would throw away the
 * distinction the engine went to the trouble of preserving.
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
    return <p className="mt-2 text-xs text-neutral-600">Nothing lands here.</p>;
  }

  return (
    <div className="mt-2">
      <ul className="divide-y divide-neutral-800/80">
        {shown.map((row) => (
          <li key={row.scenarioId} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-1.5">
            <span className="text-xs text-neutral-200">{row.vendorName}</span>
            <span className="font-mono text-xs text-neutral-400">
              {formatCents(row.amountCents as Cents)}
            </span>
            {row.origin === "synthetic" ? (
              <span className="rounded border border-neutral-700 px-1 py-0.5 text-[9px] uppercase tracking-wide text-neutral-500">
                hypothetical
              </span>
            ) : null}
            {row.matchedRuleOrdinal >= 0 ? (
              <span className="text-[11px] text-neutral-500">
                rule {row.matchedRuleOrdinal} · &ldquo;{row.matchedSourceFragment}&rdquo;
              </span>
            ) : (
              <span className="text-[11px] text-neutral-500">
                engine check ·{" "}
                {GUARD_REASON[row.code] ?? row.code.toLowerCase().replace(/_/g, " ")}
              </span>
            )}
            {row.note ? (
              <span className="w-full text-[11px] text-neutral-600">{row.note}</span>
            ) : null}
          </li>
        ))}
      </ul>

      {synthetic.length > 0 ? (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          className="mt-1.5 text-[11px] text-neutral-500 underline decoration-neutral-700 underline-offset-2 hover:text-neutral-300"
        >
          {showAll
            ? "hide the hypotheticals"
            : `show ${synthetic.length} hypothetical ${synthetic.length === 1 ? "case" : "cases"}`}
        </button>
      ) : null}
    </div>
  );
}

function ConfirmModal({
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
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded border border-neutral-700 bg-neutral-950 p-5 shadow-2xl">
        <h2 className="text-sm font-semibold tracking-tight">
          Before you grant this
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-neutral-400">
          Nothing has been granted yet. Below is what these rules would have done,
          replayed against every renewal currently on your books and against the
          boundary cases your history does not contain.
        </p>

        {preview ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {GROUPS.map((group) => (
                <div
                  key={group.effect}
                  className={`rounded border p-2.5 ${EFFECT_STYLE[group.effect]}`}
                >
                  <div className="font-mono text-lg leading-none">
                    {preview.counts[group.effect]}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-wide">
                    {group.heading}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-4">
              {GROUPS.map((group) => (
                <section key={group.effect}>
                  <h3 className="text-xs font-medium text-neutral-300">
                    {group.heading}
                  </h3>
                  <p className="text-[11px] text-neutral-500">{group.blurb}</p>
                  <PreviewTable
                    rows={preview.rows.filter((row) => row.effect === group.effect)}
                  />
                </section>
              ))}
            </div>

            <p className="mt-4 border-t border-neutral-800 pt-3 text-[11px] leading-relaxed text-neutral-500">
              {preview.scenarioCount} scenarios, battery{" "}
              <code className="text-neutral-400">{preview.batteryVersion}</code>.
              Rows marked <em>hypothetical</em> did not happen — they are
              constructed boundary cases, not history, and no model proposed them.
              Confirming records that you saw this exact preview.
            </p>
          </>
        ) : (
          // Never render an empty preview as if it were an empty result. "This
          // policy does nothing" and "we could not work out what it does" are
          // different facts and only one of them is safe to confirm past.
          <div className="mt-4 rounded border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="text-xs text-amber-200">
              The preview could not be computed.
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              The rules above are valid and this policy is still inert. You can
              confirm without a preview, but nothing will be able to prove
              afterwards that you saw what it would do.
            </p>
          </div>
        )}

        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 disabled:opacity-40"
          >
            {busy ? "Activating…" : "I have read this — activate"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <span className="text-[11px] text-neutral-500">
            Activating changes what the agent may propose. It does not move any
            ceiling — that takes a passkey.
          </span>
        </div>
      </div>
    </div>
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
            ? body.errors.map(
                (error: { clause?: string; message: string }) =>
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
        setModalError(body.error ?? `Activation failed with status ${response.status}.`);
        return;
      }

      setCompiled(null);
      router.refresh();
    } finally {
      setActivating(false);
    }
  }

  return (
    <div>
      <label
        htmlFor="policy-text"
        className="text-xs font-medium uppercase tracking-wide text-neutral-500"
      >
        Write it in English
      </label>
      <textarea
        id="policy-text"
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        spellCheck={false}
        className="mt-2 w-full rounded border border-neutral-800 bg-neutral-950 p-3 text-sm leading-relaxed text-neutral-200 outline-none focus:border-neutral-600"
        placeholder="Never auto-renew Vercel. Auto-renew anything under $500 a month. Anything over $500 a month needs my approval."
      />

      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={compiling || text.trim().length === 0}
          onClick={compile}
          className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
        >
          {compiling ? "Compiling…" : "Compile"}
        </button>
        <span className="text-[11px] text-neutral-500">
          Compiling grants nothing. You will see what it would do before you decide.
        </span>
      </div>

      {errors.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded border border-rose-500/30 bg-rose-500/5 p-3">
          {errors.map((error) => (
            <li key={error} className="text-xs text-rose-200">
              {error}
            </li>
          ))}
        </ul>
      ) : null}

      {compiled ? (
        <ConfirmModal
          compiled={compiled}
          busy={activating}
          error={modalError}
          onCancel={() => setCompiled(null)}
          onConfirm={activate}
        />
      ) : null}
    </div>
  );
}
