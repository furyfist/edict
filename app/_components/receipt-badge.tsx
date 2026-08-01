import type { ReceiptStatus } from "@/lib/attest";
import type { LedgerReceipt } from "@/lib/contracts";

/**
 * The receipt state of one entry.
 *
 * Four states, never three. UNATTESTED and INVALID are different facts and
 * collapsing them would repeat the mistake the evidence bundle refuses to make
 * with zero and unknown — an entry written before receipts existed is not a
 * forgery, and an entry that has been rewritten is not merely unsigned.
 *
 * This renders in the machine-verified surface, deliberately nowhere near the
 * agent's rationale block. A reader must always be able to tell which parts of
 * the screen a language model wrote, and this is not one of them.
 */

const LABEL: Record<ReceiptStatus, string> = {
  VALID: "receipt verified",
  INVALID: "receipt does not match — this record was altered",
  BROKEN_LINK: "chain break — an entry was removed or reordered",
  UNATTESTED: "unattested",
};

const TONE: Record<ReceiptStatus, string> = {
  VALID: "border-emerald-800/60 text-emerald-300/90",
  INVALID: "border-rose-700/70 text-rose-300",
  BROKEN_LINK: "border-rose-700/70 text-rose-300",
  UNATTESTED: "border-neutral-700 text-neutral-500",
};

export function ReceiptBadge({ status }: { status: ReceiptStatus }) {
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${TONE[status]}`}
    >
      {LABEL[status]}
    </span>
  );
}

/** The receipt itself, for a reader who wants the digests rather than a badge. */
export function ReceiptDetail({
  status,
  receipt,
  entryId,
}: {
  status: ReceiptStatus;
  receipt: LedgerReceipt | null;
  entryId: string;
}) {
  if (!receipt) {
    return (
      <p className="text-neutral-500">
        No receipt. This entry was written before receipts existed, or with no
        signing key configured. It is unattested — which is not the same as
        invalid.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      <ReceiptBadge status={status} />

      <dl className="grid gap-1">
        {[
          ["digest", receipt.digest],
          ["links to", receipt.prevDigest],
          ["signature", receipt.signature ?? "none — unattested"],
          ["key", receipt.keyId ?? "none"],
        ].map(([role, value]) => (
          <div key={role} className="flex gap-2">
            <dt className="w-28 shrink-0 text-neutral-500">{role}</dt>
            <dd className="min-w-0 break-all font-mono text-[11px] text-neutral-300">
              {value}
            </dd>
          </div>
        ))}
      </dl>

      <a
        className="inline-block text-[11px] text-neutral-400 underline underline-offset-2 hover:text-neutral-200"
        href={`/api/receipts?entry=${entryId}&download=1`}
      >
        download this receipt
      </a>
    </div>
  );
}
