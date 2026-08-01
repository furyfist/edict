import { db } from "../db/client";
import { getClock } from "../clock";
import { digestOf } from "../attest";
import { buildEvidenceBundle } from "../evidence";
import { buildBattery, replay, summarize, type Preview } from "../simulate";
import { policyById } from "./versions";
import type { EvidenceBundle, Policy } from "../contracts";

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

/**
 * One evidence bundle per vendor: the renewal currently on the books.
 *
 * Deliberately NOT the tick's seven-day lookahead. The tick asks "what is due
 * soon"; the preview asks "what does this policy mean for everything I pay
 * for." A preview covering two of eight vendors would be technically honest and
 * practically useless.
 */
export async function currentBundles(): Promise<EvidenceBundle[]> {
  const clock = await getClock();

  const renewals = await db.renewal.findMany({
    orderBy: [{ vendorId: "asc" }, { cycleStart: "desc" }],
    select: { id: true, vendorId: true },
  });

  const seen = new Set<string>();
  const latest = renewals.filter((renewal) => {
    if (seen.has(renewal.vendorId)) return false;
    seen.add(renewal.vendorId);
    return true;
  });

  const bundles = await Promise.all(
    latest.map((renewal) => buildEvidenceBundle({ renewalId: renewal.id, clock })),
  );

  return bundles
    .filter((bundle): bundle is EvidenceBundle => bundle !== null)
    .map((bundle) => ({ ...bundle, bundleId: previewBundleId(bundle.renewalId) }));
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
