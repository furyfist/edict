"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/app/_components/ui/button";

/**
 * Copy, with a check-mark for 1.2 seconds and an `aria-label` that flips to
 * "Copied" so the confirmation is not colour- or icon-only.
 *
 * Every id in this product carries one, because the entire argument is that a
 * reader can take a digest, a mandate id or a charge id somewhere else and
 * check it. An id that cannot be copied is an id nobody verifies.
 */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1200);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={copied ? "Copied" : `Copy ${label}`}
      title={copied ? "Copied" : `Copy ${label}`}
      className="text-text-subtle size-6 shrink-0"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
