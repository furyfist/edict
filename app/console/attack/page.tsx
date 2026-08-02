import { db } from "@/lib/db/client";
import { getClock } from "@/lib/clock";
import { DbUnavailable, PageHeader } from "../_components/page-header";
import { AttackConsole } from "../_components/attack-console";

export const dynamic = "force-dynamic";

/** The seeded vendor that carries reserved renewal cycles. See lib/db/seed.ts. */
const ATTACK_SURFACE = "CloudSync Pro";

/**
 * The attack console.
 *
 * The demo's climax has two beats, and this page drives the first:
 *
 *   1. The agent is fooled and proposes an over-cap payment. The deterministic
 *      policy engine refuses it, citing the owner's own sentence.
 *   2. (Announced aloud) the engine is bypassed and the charge is issued
 *      straight through the adapter — and Prava declines it, because the
 *      ceiling is enforced in the tokenized credential, outside this
 *      application entirely.
 *
 * Announce the bypass in beat 2 rather than hiding it. The honesty is what
 * makes it land: you are not claiming the agent is hard to fool, you are
 * demonstrating that fooling it does not matter.
 */
export default async function AttackPage() {
  let vendors: Array<{ id: string; name: string }> = [];
  let attested: Array<{ id: string; label: string }> = [];
  let clock = "";
  let injected = 0;
  let unavailable = false;

  try {
    clock = (await getClock()).toISOString().replace("T", " ").slice(0, 16) + "Z";
    vendors = await db.vendor.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    // The attack surface goes first, because the console defaults to whatever
    // is first and that default has to be the one that works.
    //
    // Only this vendor carries renewal cycles the overnight run cannot reach
    // (see `reservedCycles` in lib/db/seed.ts). Plant a message on any other
    // vendor and the tick correctly finds nothing to adjudicate — it reports
    // `processed: 0, skipped: 8` and the beat silently does nothing. Sorted
    // alphabetically, the default was Airtable, which is exactly that failure.
    vendors.sort((a, b) =>
      a.name === ATTACK_SURFACE ? -1 : b.name === ATTACK_SURFACE ? 1 : 0,
    );
    injected = await db.inboundMessage.count({ where: { injected: true } });

    // Only attested entries are worth attacking. Rewriting an unsigned row
    // proves nothing, and offering it would be a rigged demonstration.
    const rows = await db.ledgerEntry.findMany({
      where: { receiptDigest: { not: null } },
      select: { id: true, vendorName: true, outcome: true, amountCents: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    attested = rows.map((row) => ({
      id: row.id,
      label: `${row.vendorName} — ${row.outcome.toLowerCase()} $${(
        row.amountCents / 100
      ).toFixed(2)}`,
    }));
  } catch {
    unavailable = true;
  }

  return (
    <section>
      <PageHeader
        title="Attack"
        question="Plant a message in a vendor inbox, advance the clock, run a tick. The agent can be fooled; its ceiling cannot be argued with."
        right={
          unavailable ? null : (
            <p className="text-xs text-neutral-500">{injected} planted</p>
          )
        }
      />

      {unavailable ? (
        <DbUnavailable />
      ) : vendors.length === 0 ? (
        <p className="mt-6 text-sm text-neutral-500">
          No vendors. Run <code className="text-neutral-300">npm run seed</code>.
        </p>
      ) : (
        <>
          <AttackConsole vendors={vendors} clock={clock} attested={attested} />

          <div className="mt-8 rounded border border-neutral-800 bg-neutral-900/40 p-4">
            <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-500">
              What to say while this runs
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-300">
              The amount ceiling is enforced in the tokenized credential. Merchant,
              frequency and duration are enforced by Prava. Our policy engine is the
              first gate. Three independent layers — and none of them is the
              language model.
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              Do not say the card network enforces the whole policy. It enforces the
              amount, which is exactly the constraint under attack here.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
