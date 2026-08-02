import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The class merger.
 *
 * Every component that accepts a `className` merges it LAST, so a caller can
 * always override a default without the component having to anticipate it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS CONFIGURED RATHER THAN USED AS-IS
 *
 * The nine typography roles are custom utilities in the `text-*` namespace, and
 * out of the box tailwind-merge cannot tell `text-stat` (a size role) from
 * `text-danger` (a colour). It guesses colour — so `cn("text-stat", "text-foreground")`
 * silently DROPPED `text-stat`, and the 30px statistic on every stat tile
 * rendered at 14px.
 *
 * It failed silently and only in components that composed their classes through
 * `cn()`, which is why the page headers looked right and the stat tiles did
 * not. Declaring the roles as a font-size group fixes it in one place: they now
 * conflict with each other and with `text-sm`, exactly as they should, and
 * never with a colour.
 * ---------------------------------------------------------------------------
 */
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        "text-display",
        "text-section-title",
        "text-card-title",
        "text-body",
        "text-body-strong",
        "text-meta",
        "text-label",
        "text-mono",
        "text-stat",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs));
}
