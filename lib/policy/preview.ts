import { db } from "../db/client";
import { addDays, getClock } from "../clock";
import { digestOf } from "../attest";
import { assembleEvidence } from "../evidence";
import { buildBattery, replay, summarize, type Preview } from "../simulate";
import { policyById } from "./versions";
import type {
  EvidenceBundle,
  Frequency,
  MandateStatus,
  Policy,
} from "../contracts";

/**
 * WHERE THE PREVIEW MEETS THE DATABASE.
 *
 * The simulation plane is pure and stays that way; this file is the I/O it
 * refuses to do. It fetches the renewals currently on the books, turns them into
 * evidence bundles, and hands plain values to `lib/simulate`.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PREVIEW RUNS AT COMPILE TIME
 *
 * It belongs to the same moment as the deterministic validations: after the
 * model has returned, before a human sees anything. Computing it later — on the
 * confirm click, say — would mean the modal renders once and the preview arrives
 * second, which invites a person to confirm before it lands. The preview is the
 * consent document; it cannot be the thing that shows up after consent.
 * ---------------------------------------------------------------------------
 */

/**
 * Deterministic bundle ids.
 *
 * `buildEvidenceBundle` mints a UUID per call, which is right for a live tick —
 * each adjudication is its own event. It is wrong here: a preview built twice
 * from unchanged data must be byte-identical, because its hash is signed into
 * the activation record. The renewal identifies the bundle; nothing else needs
 * to.
 */
function previewBundleId(renewalId: string): string {
  return `preview:${renewalId}`;
}

const USAGE_LOOKBACK_DAYS = 45;
const MESSAGES_PER_VENDOR = 10;

function groupBy<T, K>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const bucket = out.get(key(item));
    if (bucket) bucket.push(item);
    else out.set(key(item), [item]);
  }
  return out;
}

/**
 * One evidence bundle per vendor: the renewal currently on the books.
 *
 * Deliberately NOT the tick's seven-day lookahead. The tick asks "what is due
 * soon"; the preview asks "what does this policy mean for everything I pay
 * for." A preview covering two of eight vendors would be technically honest and
 * practically useless.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS DOES NOT CALL buildEvidenceBundle IN A LOOP
 *
 * It did, and it cost about six seconds — eight vendors times five queries is
 * forty round trips to a database on another continent, and the compile beat is
 * one of the few operations fast enough to perform live.
 *
 * Five grouped queries instead, assembled in memory by the same pure
 * `assembleEvidence` the tick uses. That last part is what keeps this honest:
 * the preview must be built by the same function that builds the real thing, or
 * it is previewing a different system. Only the FETCHING is different, and
 * fetching is the part with no decisions in it.
 *
 * This is the same change the Vendors page already made for the same reason.
 * ---------------------------------------------------------------------------
 */
export async function currentBundles(): Promise<EvidenceBundle[]> {
  // Two waves, not three. The renewal read does not depend on the clock, so it
  // rides along with it — one fewer round trip, and round trips are the entire
  // cost here.
  //
  // Every renewal, once. Serves double duty: the current cycle per vendor, and
  // the price history for that vendor's earlier cycles.
  const [clock, renewals] = await Promise.all([
    getClock(),
    db.renewal.findMany({
      orderBy: [{ vendorId: "asc" }, { cycleStart: "desc" }],
      include: { vendor: true },
    }),
  ]);

  const since = addDays(clock, -USAGE_LOOKBACK_DAYS);

  const seen = new Set<string>();
  const current = renewals.filter((renewal) => {
    if (seen.has(renewal.vendorId)) return false;
    seen.add(renewal.vendorId);
    return true;
  });

  const vendorIds = current.map((renewal) => renewal.vendorId);
  if (vendorIds.length === 0) return [];

  const [seats, usage, mandates, messages] = await Promise.all([
    db.seat.findMany({
      where: { vendorId: { in: vendorIds } },
      select: { id: true, email: true, vendorId: true },
      orderBy: { email: "asc" },
    }),
    db.usageRecord.findMany({
      where: { vendorId: { in: vendorIds }, day: { gte: since, lte: clock } },
      select: { seatId: true, day: true, loggedIn: true, vendorId: true },
    }),
    db.mandate.findMany({ where: { vendorId: { in: vendorIds } } }),
    db.inboundMessage.findMany({
      where: { vendorId: { in: vendorIds }, receivedAt: { lte: clock } },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  const seatsBy = groupBy(seats, (seat) => seat.vendorId);
  const usageBy = groupBy(usage, (record) => record.vendorId);
  const messagesBy = groupBy(messages, (message) => message.vendorId);
  const priorBy = groupBy(renewals, (renewal) => renewal.vendorId);
  const mandateBy = new Map(mandates.map((mandate) => [mandate.vendorId, mandate]));

  return current.map((renewal) => {
    const mandate = mandateBy.get(renewal.vendorId);

    return assembleEvidence({
      clock,
      bundleId: previewBundleId(renewal.id),
      vendor: {
        id: renewal.vendor.id,
        name: renewal.vendor.name,
        category: renewal.vendor.category,
      },
      renewal: {
        id: renewal.id,
        cycleStart: renewal.cycleStart,
        dueDate: renewal.dueDate,
        amountCents: renewal.amountCents,
        currency: renewal.currency,
        frequency: renewal.frequency as Frequency,
      },
      seats: seatsBy.get(renewal.vendorId) ?? [],
      usage: usageBy.get(renewal.vendorId) ?? [],
      priceHistory: (priorBy.get(renewal.vendorId) ?? []).filter(
        (prior) => prior.cycleStart < renewal.cycleStart,
      ),
      mandate: mandate
        ? {
            pravaMandateId: mandate.pravaMandateId,
            status: mandate.status as MandateStatus,
            capCents: mandate.capCents,
            remainingCents: mandate.remainingCents,
            expiresAt: mandate.expiresAt,
          }
        : null,
      messages: (messagesBy.get(renewal.vendorId) ?? []).slice(0, MESSAGES_PER_VENDOR),
    });
  });
}

export interface PreviewResult {
  preview: Preview;
  /**
   * SHA-256 over the canonical preview — the exact projection a person saw.
   *
   * This is what the activation record embeds, which turns "the human was shown
   * what this policy would do" from a sentence in a runbook into something a
   * stranger can check.
   */
  digest: string;
}

/** Replays the battery under an already-shaped policy. Pure once the I/O is done. */
export function previewOf(policy: Policy, bundles: EvidenceBundle[]): PreviewResult {
  const battery = buildBattery(bundles);
  const preview = summarize(battery, replay({ scenarios: battery.scenarios, policy }));
  return { preview, digest: digestOf(preview) };
}

/**
 * The compile-time entry point: preview a draft that governs nothing yet.
 *
 * Returns null when the version is unknown. A missing preview is rendered as a
 * missing preview — never as an empty one, which would read as "this policy does
 * nothing."
 */
export async function previewVersion(
  policyVersionId: string,
): Promise<PreviewResult | null> {
  const policy = await policyById(policyVersionId);
  if (!policy) return null;

  return previewOf(policy, await currentBundles());
}
