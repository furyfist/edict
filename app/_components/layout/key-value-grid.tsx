import { cn } from "@/app/_lib/cn";

export interface KeyValueItem {
  label: string;
  value: React.ReactNode;
  /** Machine facts — ids, digests, paths, hashes — render in mono and wrap. */
  mono?: boolean;
}

/**
 * The two-column definition list every detail panel uses.
 *
 * `display: contents` on each pair is what lets a `<dt>/<dd>` couple key off
 * the parent grid while keeping valid `<dl>` semantics. Without it you either
 * lose the grid or lose the markup, and this product cannot afford to lose the
 * markup — these are the facts a reader is meant to copy out and check.
 *
 * A value that is genuinely unknown renders an em-dash, never a zero. `null`
 * and `0` are different claims and the interface must not collapse them.
 */
export function KeyValueGrid({
  items,
  className,
}: {
  items: KeyValueItem[];
  className?: string;
}) {
  return (
    <dl
      className={cn(
        "grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-6 gap-y-3 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-label text-text-subtle pt-0.5">{item.label}</dt>
          <dd
            className={cn(
              "min-w-0",
              item.mono
                ? "text-mono text-foreground break-all"
                : "text-body text-foreground",
            )}
          >
            {item.value ?? <Unknown />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Never fabricate a value. Unknown is an em-dash carrying its own explanation,
 * and it is deliberately not styled like data.
 */
export function Unknown({ title }: { title?: string }) {
  return (
    <span
      className="text-text-subtle"
      title={title ?? "Not known — this value was never recorded."}
    >
      —
    </span>
  );
}
