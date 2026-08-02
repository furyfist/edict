import type { ReceiptStatus } from "@/lib/attest";
import type { LedgerReceipt } from "@/lib/contracts";
import { Badge } from "@/app/_components/ui/badge";
import { KeyValueGrid } from "@/app/_components/layout/key-value-grid";
import { MonoId } from "./mono";
import { receiptTone } from "@/app/_lib/tone";

/**
 * The receipt state of one entry.
 *
 * Four states, never three. UNATTESTED and INVALID are different facts and
 * collapsing them would repeat the mistake the evidence bundle refuses to make
 * with zero and unknown — an entry written before receipts existed is not a
 * forgery, and an entry that has been rewritten is not merely unsigned. The
 * tone map keeps that distinction visible: unattested is grey, altered is red.
 *
 * This renders in the machine-verified surface, deliberately nowhere near the
 * agent's rationale block.
 */
const LABEL: Record<ReceiptStatus, string> = {
  VALID: "receipt verified",
  INVALID: "receipt does not match — this record was altered",
  BROKEN_LINK: "chain break — an entry was removed or reordered",
  UNATTESTED: "unattested",
};

export function ReceiptBadge({ status }: { status: ReceiptStatus }) {
  return <Badge tone={receiptTone(status)}>{LABEL[status]}</Badge>;
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
      <p className="text-meta text-text-muted">
        No receipt. This entry was written before receipts existed, or with no
        signing key configured. It is unattested — which is not the same as
        invalid.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ReceiptBadge status={status} />

      <KeyValueGrid
        items={[
          { label: "digest", value: <MonoId value={receipt.digest} label="digest" /> },
          {
            label: "links to",
            value: <MonoId value={receipt.prevDigest} label="previous digest" />,
          },
          {
            label: "signature",
            value: receipt.signature ? (
              <MonoId value={receipt.signature} label="signature" truncate={44} />
            ) : (
              <span className="text-meta text-text-subtle">
                none — unattested
              </span>
            ),
          },
          { label: "key", value: <MonoId value={receipt.keyId} label="key id" /> },
        ]}
      />

      <a
        className="text-info text-meta w-fit hover:underline"
        href={`/api/receipts?entry=${entryId}&download=1`}
      >
        Download this receipt
      </a>
    </div>
  );
}
