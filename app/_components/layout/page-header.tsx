import { cn } from "@/app/_lib/cn";

/**
 * Every route opens with this component, and its description is always a
 * QUESTION — "What the agent did", "What it would not do", "How much rope is
 * left". One question per screen is the organising principle of the whole
 * console: if a page cannot be summarised as a question, it is doing two jobs.
 *
 * `pb-6` below and zero above. Headings sit close to their content and far from
 * what precedes them.
 */
export function PageHeader({
  title,
  question,
  actions,
  className,
}: {
  title: string;
  question: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-4 pb-6", className)}
    >
      <div className="min-w-0">
        <h1 className="text-display text-foreground">{title}</h1>
        <p className="text-body text-text-muted mt-1 max-w-2xl">{question}</p>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
