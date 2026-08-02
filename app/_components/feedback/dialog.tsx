"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/app/_lib/cn";

/**
 * The dialog.
 *
 * ---------------------------------------------------------------------------
 * A 10% SCRIM, NOT 50%
 *
 * `bg-black/10` plus a small backdrop blur, so the page stays legible behind
 * the dialog and it reads as LAYERED rather than as BLOCKING. Most applications
 * black the background out and the result feels heavy. Here it also carries
 * meaning: the preview a person is confirming sits above the policy they wrote,
 * and hiding that context would be the wrong thing to do at exactly the moment
 * they are about to grant authority.
 * ---------------------------------------------------------------------------
 *
 * The footer bleeds to the dialog edge and reverses on mobile, putting the
 * primary action last on desktop and first on mobile — correct for both
 * platforms' conventions.
 *
 * Escape closes; focus moves into the panel on open and the trigger's page
 * cannot be scrolled underneath.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  footer,
  size = "sm",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  /** Decisions are small; data is not. */
  size?: "sm" | "lg";
  children?: React.ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto p-4 sm:p-8">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        onClick={onClose}
        className="animate-overlay-in fixed inset-0 bg-black/10 backdrop-blur-[2px]"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "animate-dialog-in bg-popover relative mx-auto flex flex-col gap-4",
          "rounded-xl p-4 shadow-e3 outline-none ring-1 ring-foreground/10",
          size === "sm" ? "max-w-sm" : "max-w-3xl",
        )}
      >
        <div>
          <h2 className="text-card-title text-foreground">{title}</h2>
          {description ? (
            <p className="text-meta text-text-muted mt-1">{description}</p>
          ) : null}
        </div>

        {children}

        {footer ? (
          <div className="border-border bg-muted/50 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:items-center sm:justify-end">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
