/**
 * One-off: clear ledger entries + ticks so the next tick re-adjudicates the
 * current cycle, WITHOUT wiping vendors/mandates (which a full reseed would,
 * taking the real Prava mandate link with it).
 */
import { db } from "../lib/db/client";

async function main() {
  const entries = await db.ledgerEntry.deleteMany();
  const ticks = await db.tick.deleteMany();
  await db.systemState.update({
    where: { id: "singleton" },
    data: { tickLockHeldBy: null, tickLockAt: null },
  });
  console.log("cleared", { entries: entries.count, ticks: ticks.count });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
