import type { Cents } from "../contracts";
import type { ChargeRecord } from "../prava";

/**
 * TWO-SIDED RECONCILIATION — the completeness proof.
 *
 * ---------------------------------------------------------------------------
 * THE GAP THIS CLOSES
 *
 * The ledger is append-only, hash-linked, and signed. Every one of those
 * properties proves the same kind of thing: that what is written was not
 * ALTERED. None of them can prove that what happened was WRITTEN.
 *
 * An attacker whose entire strategy is to move money without leaving a record
 * defeats a tamper-evident log completely. The log is perfectly intact and
 * perfectly silent.
 *
 * Closing that needs a second book kept by someone else. Prava's charge history
 * is that book, and this module compares them in both directions:
 *
 *   direction one   every executed entry has a network-side charge
 *                   → catches a ledger that claims money moved when it did not
 *
 *   direction two   every network-side charge has a ledger entry
 *                   → catches money that moved with no record at all
 *
 * Direction two is the one that matters, and it is the one that needs
 * enumeration. See docs/spikes/prava-charge-history.md for why that is not free.
 *
 * ---------------------------------------------------------------------------
 * PURE, LIKE THE ENGINE
 *
 * No I/O. The caller fetches both books and hands them over. That is what lets
 * a reconciliation be replayed from an attestation later, and it is what keeps
 * `lib/reconcile` from becoming a second module that talks to Prava.
 * ---------------------------------------------------------------------------
 */

/** Our side, projected from the ledger. One row per entry that claims money moved. */
export interface LedgerCharge {
  entryId: string;
  vendorName: string;
  mandateId: string;
  /** Null when an entry recorded an execution but never received an id. */
  chargeId: string | null;
  amountCents: Cents;
  /** `${renewalId}:${cycleStart}` — the reference the adapter sends. */
  reference: string;
}

/**
 * The three accusations. Each is a different failure with a different defence,
 * and collapsing them into "books don't balance" would throw away the only
 * information anyone can act on.
 */
export type DiscrepancyKind =
  /** Money moved and we have no record of it. The one that means fraud or a bug. */
  | "ORPHAN_CHARGE"
  /** We claim money moved; the network has no such charge. */
  | "ORPHAN_ENTRY"
  /** Both books have it, and they disagree about how much. */
  | "AMOUNT_MISMATCH";

export interface Discrepancy {
  kind: DiscrepancyKind;
  /** Enough to go and look. Never a count, always an identifier. */
  chargeId: string | null;
  entryId: string | null;
  mandateId: string;
  vendorName: string | null;
  /** What our book says, in cents. Null when our book has nothing. */
  ledgerCents: Cents | null;
  /** What the network says, in cents. Null when the network has nothing. */
  networkCents: Cents | null;
  /** One sentence, written for a human reading it under pressure. */
  detail: string;
}

export interface ReconcileInput {
  mandateId: string;
  /** Entries claiming an executed charge against this mandate. */
  entries: LedgerCharge[];
  /** The network's own record for this mandate. */
  charges: ChargeRecord[];
}

export interface ReconcileOutput {
  mandateId: string;
  entriesChecked: number;
  chargesChecked: number;
  matched: number;
  discrepancies: Discrepancy[];
}

/**
 * Compares one mandate's two books.
 *
 * Matching is by charge id first, then by reference. The reference fallback
 * matters more than it looks: an entry that recorded an execution without ever
 * receiving a charge id is exactly the shape a crash mid-charge leaves behind,
 * and calling that fraud because the ids do not line up would be a false
 * accusation the system makes about itself.
 */
export function reconcile(input: ReconcileInput): ReconcileOutput {
  const byChargeId = new Map(input.charges.map((charge) => [charge.chargeId, charge]));
  const byReference = new Map(
    input.charges
      .filter((charge) => charge.reference !== null)
      .map((charge) => [charge.reference as string, charge]),
  );

  const discrepancies: Discrepancy[] = [];
  const claimed = new Set<string>();
  let matched = 0;

  // -- direction one: every entry has a charge --------------------------------
  for (const entry of input.entries) {
    // A charge already claimed by an earlier entry is not available to this one.
    //
    // Without this, two ledger entries citing the same charge would BOTH
    // reconcile clean — and double-recording a single payment is precisely the
    // sort of quiet books error a reconciliation is supposed to surface. One
    // charge, one entry, or it is a discrepancy.
    const candidate =
      (entry.chargeId !== null ? byChargeId.get(entry.chargeId) : undefined) ??
      byReference.get(entry.reference);

    const charge = candidate && !claimed.has(candidate.chargeId) ? candidate : undefined;

    if (!charge) {
      discrepancies.push({
        kind: "ORPHAN_ENTRY",
        chargeId: entry.chargeId,
        entryId: entry.entryId,
        mandateId: entry.mandateId,
        vendorName: entry.vendorName,
        ledgerCents: entry.amountCents,
        networkCents: null,
        detail:
          entry.chargeId === null
            ? `Entry ${entry.entryId} records a charge for ${entry.vendorName} but carries no charge id, and nothing in the network's book matches its reference.`
            : candidate
              ? `Entry ${entry.entryId} cites charge ${entry.chargeId}, which another entry has already accounted for. One charge cannot pay for two records.`
              : `Entry ${entry.entryId} cites charge ${entry.chargeId}, which the network has no record of.`,
      });
      continue;
    }

    claimed.add(charge.chargeId);

    if (charge.amountCents !== entry.amountCents) {
      discrepancies.push({
        kind: "AMOUNT_MISMATCH",
        chargeId: charge.chargeId,
        entryId: entry.entryId,
        mandateId: entry.mandateId,
        vendorName: entry.vendorName,
        ledgerCents: entry.amountCents,
        networkCents: charge.amountCents,
        detail: `Charge ${charge.chargeId} for ${entry.vendorName}: our books say ${entry.amountCents} cents, the network says ${charge.amountCents}.`,
      });
      continue;
    }

    matched += 1;
  }

  // -- direction two: every charge has an entry -------------------------------
  // The direction that catches money moving without a record. Everything above
  // could be satisfied by a ledger that simply omits its crimes.
  for (const charge of input.charges) {
    if (claimed.has(charge.chargeId)) continue;

    discrepancies.push({
      kind: "ORPHAN_CHARGE",
      chargeId: charge.chargeId,
      entryId: null,
      mandateId: charge.mandateId,
      vendorName: null,
      ledgerCents: null,
      networkCents: charge.amountCents,
      detail: `The network charged ${charge.amountCents} cents on mandate ${charge.mandateId} (charge ${charge.chargeId}${charge.reference ? `, reference ${charge.reference}` : ""}) and our ledger has no entry for it.`,
    });
  }

  return {
    mandateId: input.mandateId,
    entriesChecked: input.entries.length,
    chargesChecked: input.charges.length,
    matched,
    discrepancies,
  };
}
