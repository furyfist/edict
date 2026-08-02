import { cn } from "@/app/_lib/cn";

/**
 * The card.
 *
 * Flat white on near-white; the 1px hairline IS the card. There is no shadow at
 * rest anywhere in the console — emphasis escalates through a fixed ladder and
 * a card never skips to the top of it:
 *
 *   1. flat + 1px border                        ← every console card
 *   2. + hover background tint                  ← the card is a link
 *   3. + shadow-e1, hover lift to shadow-e3     ← landing-page feature cards
 *   4. + shadow-e3 + border-strong              ← one hero card per screen
 */
export function Card({
  className,
  interactive,
  ...props
}: React.ComponentProps<"div"> & { interactive?: boolean }) {
  return (
    <div
      data-slot="card"
      className={cn(
        "border-border bg-card rounded-lg border p-4",
        interactive &&
          "hover:bg-surface-subtle transition-colors duration-[var(--duration-hover)] ease-[var(--ease-standard)]",
        className,
      )}
      {...props}
    />
  );
}

/**
 * An inset panel inside a card — code blocks, quoted model output, nested
 * detail. `bg-surface-subtle` rather than a second border, so cards never
 * stack outlines.
 */
export function Inset({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("bg-surface-subtle rounded-md p-3", className)}
      {...props}
    />
  );
}
