import { Sparkles } from "lucide-react";
import { cn } from "@/app/_lib/cn";

/**
 * MODEL OUTPUT, FENCED.
 *
 * A reader must always be able to tell which words on the screen a language
 * model wrote. Everything else in this product is a signature, a rule, or a
 * number someone else can check; this block is the one part that is prose from
 * a model, and separating it makes everything around it more credible rather
 * than less.
 *
 * The dashed border is doing the same job it does on an empty state — it marks
 * a container whose contents are provisional. It is the only dashed border in
 * the console that is not an empty state, and that is deliberate.
 */
export function ModelOutput({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border-strong/70 rounded-md border border-dashed p-3",
        className,
      )}
    >
      <p className="text-label text-text-subtle flex items-center gap-1.5">
        <Sparkles className="size-3" aria-hidden />
        agent&apos;s stated reasoning — model output
      </p>
      <p className="text-body text-text-muted mt-1.5">{children}</p>
    </div>
  );
}
