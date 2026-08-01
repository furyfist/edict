import { listVersions } from "@/lib/policy/versions";
import { formatCents } from "@/lib/contracts/money";
import type { Cents } from "@/lib/contracts";
import { DbUnavailable, PageHeader } from "../_components/page-header";

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

const EFFECT_STYLE: Record<string, string> = {
  DENY: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  REQUIRE_APPROVAL: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  ALLOW_AUTO: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
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

  return (
    <section>
      <PageHeader
        title="Policy"
        question="Your words on the left, the rules they compiled into on the right. Nothing enforces anything it cannot quote."
      />

      {unavailable ? (
        <DbUnavailable />
      ) : !active ? (
        <p className="mt-6 text-sm text-neutral-500">
          No active policy. The agent halts until one is activated.
        </p>
      ) : (
        <>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                What you wrote — version {active.version}
              </h2>
              <blockquote className="mt-3 border-l-2 border-neutral-700 pl-3 text-sm leading-relaxed text-neutral-200">
                {active.englishText}
              </blockquote>
            </div>

            <div>
              <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                What it enforces
              </h2>
              <ol className="mt-3 space-y-3">
                {active.rules.map((rule) => (
                  <li
                    key={rule.id}
                    className="rounded border border-neutral-800 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[10px] text-neutral-600">
                        {rule.ordinal}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                          EFFECT_STYLE[rule.effect] ??
                          "border-neutral-700 text-neutral-400"
                        }`}
                      >
                        {rule.effect.toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {scopeSummary(rule)}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-neutral-400">
                      {conditionSummary(rule)}
                    </p>

                    <p className="mt-2 text-xs italic text-neutral-300">
                      &ldquo;{rule.sourceFragment}&rdquo;
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          {others.length > 0 ? (
            <div className="mt-10">
              <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                Version history
              </h2>
              <ul className="mt-3 divide-y divide-neutral-800/80 border-y border-neutral-800/80">
                {others.map((version) => (
                  <li
                    key={version.id}
                    className="flex items-baseline justify-between gap-4 py-2.5"
                  >
                    <span className="truncate text-sm text-neutral-400">
                      v{version.version} · {version.englishText.slice(0, 70)}
                      {version.englishText.length > 70 ? "…" : ""}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-neutral-600">
                      {version.status.toLowerCase()}
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
