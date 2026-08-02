import { cn } from "@/app/_lib/cn";

/**
 * Every content group on every page is one of these.
 *
 * The page rhythm is a repeating three-beat — 18px title → 12px gap → content
 * → 32px gap to the next section. Because `Section` is a single component used
 * everywhere, that rhythm is impossible to break by accident.
 *
 * Note there is no divider. Section separation is whitespace; the only
 * structural borders in the console are the shell edges, table frames and card
 * outlines.
 */
export function Section({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <h2 className="text-section-title text-foreground">{title}</h2>
          {description ? (
            <p className="text-meta text-text-muted mt-0.5 max-w-2xl">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** The vertical stack every console page uses: 32px between top-level sections. */
export function PageSections({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-8", className)} {...props} />;
}
