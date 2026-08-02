import { cn } from "@/app/_lib/cn";

/**
 * Form controls.
 *
 * All three share one shape: 32px tall (textarea excepted), 14px radius,
 * transparent background so a control inherits whatever surface it sits on,
 * and `border-input` — the one heavier hairline in the product, which is how a
 * control reads as editable at a glance.
 *
 * `text-base md:text-sm` is load-bearing: 16px on mobile is what stops iOS
 * zooming the viewport on focus. Do not remove it.
 */
const CONTROL = [
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5",
  "text-base transition-colors outline-none md:text-sm",
  "placeholder:text-text-subtle",
  "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
  "disabled:cursor-not-allowed disabled:opacity-50",
].join(" ");

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(CONTROL, "h-8 py-1", className)} {...props} />;
}

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(CONTROL, "min-h-16 py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

export function Select({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(CONTROL, "h-8 cursor-pointer py-1 pr-8", className)}
      {...props}
    />
  );
}

/** Label → 6px → control → 4px → error. Always, in every form in the app. */
export function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("text-label text-text-muted block", className)}
      {...props}
    />
  );
}

export function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="text-danger text-meta mt-1">{children}</p>;
}

/** Hint text under a control — the explanation, not the error. */
export function FieldHint({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-meta text-text-muted mt-1.5", className)} {...props} />
  );
}
