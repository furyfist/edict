import { cn } from "@/app/_lib/cn";

/**
 * AMBIENT DECORATION THAT ISN'T DECORATION.
 *
 * Every layer here is `--border`-tinted at low opacity, radially masked,
 * `pointer-events-none` and `aria-hidden`. The radial mask is the whole trick:
 * it is what keeps texture from becoming wallpaper, because the pattern fades
 * to nothing well before it reaches any text.
 *
 * Nothing moves. This product's entire argument is that it is calm and
 * checkable, and a page that drifts and pulses at a reader is arguing the
 * opposite while the copy claims otherwise.
 */

/** A 64px hairline grid — the ruled paper a ledger is written on. */
export function BackgroundGrid({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      style={{
        backgroundImage:
          "linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
        backgroundSize: "64px 64px",
      }}
    />
  );
}

/** A dot field, for depth without a second grid weight. */
export function AmbientDots({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute", className)}
      style={{
        backgroundImage:
          "radial-gradient(var(--border-strong) 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    />
  );
}

/**
 * The full ambient stack for the entry page, masked so both layers dissolve
 * before the hero copy begins.
 */
export function AmbientBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <BackgroundGrid
        className="inset-y-0 right-0 w-full opacity-60 [mask-image:radial-gradient(circle_at_top_right,black,transparent_65%)] lg:w-[62vw]"
      />
      <AmbientDots
        className="inset-0 opacity-40 [mask-image:radial-gradient(circle_at_82%_8%,black,transparent_55%)]"
      />
    </div>
  );
}
