"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The expansion surface.
 *
 * Built on the native <dialog> element rather than a hand-rolled overlay: the
 * focus trap, the escape-to-close, and the inertness of the page behind it are
 * behaviors the platform already implements correctly, and a demo is exactly
 * where a hand-rolled version fails in a way somebody notices.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(event) => {
        // Click outside the panel closes. The dialog element itself is the
        // backdrop, so a click landing on it rather than on a child is outside.
        if (event.target === ref.current) onClose();
      }}
      style={{
        background: "var(--panel)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 0,
        maxWidth: 640,
        width: "calc(100vw - 32px)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            marginLeft: "auto",
            background: "transparent",
            border: "none",
            color: "var(--muted)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>
      <div style={{ padding: 16, maxHeight: "70vh", overflowY: "auto" }}>
        {children}
      </div>
    </dialog>
  );
}
