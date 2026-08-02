import { cn } from "@/app/_lib/cn";

/**
 * The table.
 *
 * 44px rows, a 40px header in 11px uppercase — headers are labels, not content
 * — `px-3` cells, and `hover:bg-surface-subtle`. The frame is the only border;
 * rows are separated by a single hairline each and nothing else.
 *
 * `TableFrame` takes a REQUIRED `empty` node, so a caller cannot ship a table
 * that renders nothing when the data is nothing. If the API cannot force the
 * empty case, the component signature can.
 */
export function TableFrame({
  children,
  empty,
  isEmpty,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  empty: React.ReactNode;
  isEmpty: boolean;
}) {
  if (isEmpty) return <>{empty}</>;

  return (
    <div
      className={cn(
        "border-border overflow-x-auto rounded-md border",
        className,
      )}
      {...props}
    >
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="bg-surface-subtle">
      <tr className="border-border border-b">{children}</tr>
    </thead>
  );
}

export function TH({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      scope="col"
      className={cn(
        // `text-label` already carries the 600 weight — headers are labels.
        "text-label text-text-muted h-10 px-3 whitespace-nowrap",
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody>{children}</tbody>;
}

export function TR({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      className={cn(
        "border-border hover:bg-surface-subtle border-b transition-colors last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      className={cn("text-body text-foreground h-11 px-3 align-middle", className)}
      {...props}
    />
  );
}
