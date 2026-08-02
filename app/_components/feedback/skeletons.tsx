import { cn } from "@/app/_lib/cn";

/**
 * SKELETONS, SIZED FROM THE REAL THING.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE EXIST AT ALL
 *
 * Every console route is `force-dynamic` and reads a remote database. Measured
 * warm, that is ~2.5s per navigation — during which, before these existed, the
 * screen showed the PREVIOUS page with no indication that anything had been
 * clicked. A sidebar item did not even highlight. The product's slowest moment
 * was also its least communicative one.
 *
 * Each shape below was measured against the component it stands in for
 * (stat tile 111px, page header 102px, ledger row 105px) rather than guessed,
 * so data arriving does not shove the layout. A skeleton that is the wrong
 * height is worse than no skeleton: it moves the thing you were about to read.
 *
 * Never a spinner above the fold.
 * ---------------------------------------------------------------------------
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("bg-muted animate-pulse rounded-md", className)}
    />
  );
}

/** `PageHeader`: a 32px title over a two-line question, with its `pb-6`. */
export function SkeletonPageHeader() {
  return (
    <div className="pb-6">
      <Skeleton className="h-8 w-44" />
      <Skeleton className="mt-1 h-5 w-full max-w-2xl" />
      <Skeleton className="mt-1 h-5 w-2/3 max-w-md" />
    </div>
  );
}

/** `Section`: an 18px title and its `pb-3`. */
export function SkeletonSectionHeader() {
  return (
    <div className="pb-3">
      <Skeleton className="h-6 w-40" />
    </div>
  );
}

/** `StatTile`: 11px label → 30px value → 13px caption, inside `p-4`. */
export function SkeletonStatTile() {
  return (
    <div className="border-border bg-card rounded-md border p-4">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-1 h-[34px] w-16" />
      <Skeleton className="mt-1 h-[19px] w-24" />
    </div>
  );
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonStatTile key={i} />
      ))}
    </div>
  );
}

/** A record row: leading chip, flexible body, trailing metadata. */
export function SkeletonCard() {
  return (
    <div className="border-border bg-card flex gap-3 rounded-lg border p-4">
      <Skeleton className="rounded-4xl h-5 w-14 shrink-0" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="mt-1.5 h-4 w-1/2" />
        <Skeleton className="mt-1.5 h-4 w-2/3" />
      </div>
      <Skeleton className="h-4 w-16 shrink-0" />
    </div>
  );
}

export function SkeletonCards({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

/** The table frame: a 40px header over 44px rows. */
export function SkeletonTable({
  rows = 8,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="border-border overflow-hidden rounded-md border">
      <div className="bg-surface-subtle border-border flex h-10 items-center gap-3 border-b px-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="border-border flex h-11 items-center gap-3 border-b px-3 last:border-b-0"
        >
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
