import { cn } from "@/app/_lib/cn";
import { CopyButton } from "./copy-button";
import { Unknown } from "@/app/_components/layout/key-value-grid";

/**
 * Machine facts render in mono; human prose renders in Inter. That distinction
 * is itself information rather than styling — it is how a reader tells at a
 * glance which words on the screen a language model wrote and which came out of
 * a signature.
 */
export function Mono({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn("text-mono text-foreground break-all select-all", className)}
      {...props}
    />
  );
}

/**
 * An identifier with its copy affordance. The full value is always in `title`
 * and always selectable, so truncation never loses it.
 */
export function MonoId({
  value,
  label,
  truncate,
  className,
}: {
  value: string | null | undefined;
  label: string;
  /** Show only the first N characters. The full value stays copyable. */
  truncate?: number;
  className?: string;
}) {
  if (!value) return <Unknown title={`No ${label} was recorded.`} />;

  const shown =
    truncate && value.length > truncate ? `${value.slice(0, truncate)}…` : value;

  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <Mono title={value} className="min-w-0 truncate">
        {shown}
      </Mono>
      <CopyButton value={value} label={label} />
    </span>
  );
}

/**
 * A machine block — SQL, a planted message, a raw report. `bg-surface-subtle`
 * rather than a border, because a code block nested in a card must not stack a
 * second outline against the card's own.
 */
export function MonoBlock({
  className,
  ...props
}: React.ComponentProps<"pre">) {
  return (
    <pre
      className={cn(
        "bg-surface-subtle text-mono text-foreground overflow-x-auto rounded-md p-3 whitespace-pre-wrap",
        className,
      )}
      {...props}
    />
  );
}
