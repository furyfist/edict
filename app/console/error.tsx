"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { PageHeader } from "@/app/_components/layout/page-header";

/**
 * The console's error boundary.
 *
 * Before this existed, a thrown error dropped the reader onto React's default
 * screen — no sidebar, no way back, and none of this product's design language.
 * For an application whose argument is that every state is accounted for,
 * falling off the happy path into an unstyled page is an expensive way to lose
 * the point.
 *
 * The error's own message is rendered VERBATIM in mono, the same as every other
 * machine fact here. Paraphrasing it would leave the reader unable to search
 * for it, and `digest` is what correlates this screen with the server log.
 */
export default function ConsoleError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <PageHeader
        title="Something failed on this page"
        question="The rest of the console is unaffected — the sidebar still works, and nothing here has changed any state."
      />

      <div
        role="alert"
        className="border-danger/40 bg-risk-high-bg flex flex-col items-start gap-3 rounded-md border p-4"
      >
        <div className="flex items-start gap-2">
          <AlertTriangle className="text-danger mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="text-body-strong text-danger">
            {error.message || "The page could not be rendered."}
          </span>
        </div>

        {error.digest ? (
          <p className="text-mono text-foreground/80">digest {error.digest}</p>
        ) : null}

        <Button variant="outline" size="sm" onClick={reset}>
          <RotateCcw aria-hidden />
          Try again
        </Button>
      </div>
    </>
  );
}
