import { cn } from "@/app/_lib/cn";
import { TONE_CLASSES, type Tone } from "@/app/_lib/tone";

/**
 * The badge primitive — 20px tall, pill radius, 12px/500, icons forced to 12px.
 *
 * Every semantic chip in the product is one line on top of this, passing a
 * `tone` that came from `_lib/tone.ts`. Nothing here chooses a colour.
 */
export function Badge({
  tone = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1",
        "rounded-4xl border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        "[&>svg]:pointer-events-none [&>svg]:size-3!",
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
