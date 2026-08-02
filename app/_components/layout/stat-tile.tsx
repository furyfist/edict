import { cn } from "@/app/_lib/cn";
import { TONE_TEXT, type Tone } from "@/app/_lib/tone";

/**
 * Three lines: an 11px uppercase label, a 30px tabular number, an optional
 * 13px toned caption — on 4px attachment margins.
 *
 * The `tone` is `"neutral"` when the number is unremarkable and only chromatic
 * when there is something to act on. A healthy screen is achromatic; when one
 * thing needs attention it is the only coloured element on the page, which is
 * exactly why it works.
 */
export function StatTile({
  label,
  value,
  caption,
  tone = "neutral",
  className,
}: {
  label: string;
  value: React.ReactNode;
  caption?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div
      className={cn("border-border bg-card rounded-md border p-4", className)}
    >
      <div className="text-label text-text-muted">{label}</div>
      <div
        className={cn(
          "text-stat mt-1",
          tone === "neutral" ? "text-foreground" : TONE_TEXT[tone],
        )}
      >
        {value}
      </div>
      {caption ? (
        <div className="text-meta text-text-muted mt-1">{caption}</div>
      ) : null}
    </div>
  );
}

/** The standard stat row: two up on mobile, four up from `sm`. */
export function StatGrid({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("grid grid-cols-2 gap-4 sm:grid-cols-4", className)}
      {...props}
    />
  );
}
