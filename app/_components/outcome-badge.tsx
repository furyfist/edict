import type { Outcome } from "@/lib/contracts";

/**
 * Outcome badge.
 *
 * The vocabulary is deliberate: "acted", not "flagged"; "refused", not "needs
 * review". Say the agent flagged three items and you are a dashboard. Say it
 * acted on three and refused one and you are an agent. Same data, different
 * product.
 */
const STYLES: Record<Outcome, { label: string; className: string }> = {
  EXECUTED: {
    label: "acted",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  },
  ESCALATED: {
    label: "asked",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  },
  REFUSED: {
    label: "refused",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  },
  FAILED: {
    label: "failed",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  },
  HALTED: {
    label: "halted",
    className: "border-neutral-600 bg-neutral-800 text-neutral-300",
  },
};

export function OutcomeBadge({ outcome }: { outcome: Outcome }) {
  const style = STYLES[outcome];
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style.className}`}
    >
      {style.label}
    </span>
  );
}
