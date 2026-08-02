import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/app/_lib/cn";

/**
 * The button.
 *
 * Two behaviours worth naming, because call sites rely on them:
 *
 *   Icons size themselves. `[&_svg:not([class*='size-'])]:size-4` means you
 *   write `<Button><Search />Search</Button>` and the icon is correct. A call
 *   site cannot get it wrong, and there is no per-use sizing to drift.
 *
 *   The press is one pixel down, never a scale. A 1px press reads as physical;
 *   a scale reads as a toy.
 *
 * `destructive` is a TINTED button, not a red slab. Solid red is reserved for
 * the confirm action inside a dialog, where it appears at most once per screen.
 */
const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-transparent",
    "text-sm font-medium whitespace-nowrap outline-none select-none",
    "transition-[background-color,border-color,color,box-shadow,transform]",
    "duration-[var(--duration-hover)] ease-[var(--ease-standard)]",
    "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
    "active:translate-y-px",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-border/60",
        ghost: "text-text-muted hover:bg-muted hover:text-foreground",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:ring-destructive/20",
        /** The only solid-red control in the product. Dialog confirms only. */
        danger: "bg-danger text-white hover:bg-danger/90",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        /* 32px, not 28px: `sm` is used pervasively including on decision
           controls, and 28px is below a comfortable target. */
        sm: "h-8 px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        default: "h-8 px-2.5",
        lg: "h-9 px-3",
        icon: "size-8 px-0",
        "icon-sm": "size-8 px-0 [&_svg:not([class*='size-'])]:size-3.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
