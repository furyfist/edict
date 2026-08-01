/**
 * THE RECONCILER — completeness, proved against someone else's book.
 *
 * The core is pure: it compares two sets and names what does not line up. The
 * fetching lives above it, and the payment side is read through `lib/prava`'s
 * index like every other consumer — the reconciler must never become a second
 * module that talks to the network.
 */

export { reconcile } from "./core";
export type {
  Discrepancy,
  DiscrepancyKind,
  LedgerCharge,
  ReconcileInput,
  ReconcileOutput,
} from "./core";
