/**
 * Placeholder for routes whose real implementation lands in a later phase.
 *
 * Exists so the seven-route nav is navigable from M0 rather than serving 404s,
 * and so it is obvious at a glance which surfaces are not built yet. Every one
 * of these is deleted as its page is implemented.
 */
export function PhasePlaceholder({
  title,
  phase,
  question,
}: {
  title: string;
  phase: string;
  question: string;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-3">
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <span className="rounded border border-neutral-700 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
          {phase}
        </span>
      </div>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-neutral-400">
        {question}
      </p>
      <p className="mt-6 text-xs text-neutral-600">
        Not implemented yet. See docs/implementation_handbook.md.
      </p>
    </section>
  );
}
