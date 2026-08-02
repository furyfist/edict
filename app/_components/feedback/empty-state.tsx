import { Inbox, SearchX, type LucideIcon } from "lucide-react";
import { cn } from "@/app/_lib/cn";

/**
 * The empty state.
 *
 * `variant` is a REQUIRED prop, and that is the entire point of the component.
 * "No data yet" and "no matches for your filter" are different facts, and
 * conflating them is the most common dashboard bug there is. The type system
 * prevents it here rather than a code review having to catch it.
 *
 * `border-dashed` says "a container that could hold things" in one class, and
 * `py-12` is deliberately airy — in this product an empty list is very often
 * the good state, so it is written to reassure rather than to apologise.
 */
const VARIANT_ICON: Record<"no-data" | "no-matches", LucideIcon> = {
  "no-data": Inbox,
  "no-matches": SearchX,
};

export function EmptyState({
  variant,
  title,
  description,
  action,
  className,
}: {
  variant: "no-data" | "no-matches";
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const Icon = VARIANT_ICON[variant];

  return (
    <div
      className={cn(
        "border-border flex flex-col items-center justify-center gap-2",
        "rounded-md border border-dashed py-12 text-center",
        className,
      )}
    >
      <Icon className="text-text-subtle mb-1 size-6" aria-hidden />
      <p className="text-body-strong text-foreground">{title}</p>
      {description ? (
        <p className="text-meta text-text-muted max-w-sm px-6">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
