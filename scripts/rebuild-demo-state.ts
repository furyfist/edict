/**
 * ONE COMMAND TO A DEMO-READY DATABASE.
 *
 *   npm run demo:rebuild
 *
 * Reseed, one operational tick, the full corpus, a reconciliation, and the
 * signed adversarial record — in that order, because the record cites the
 * completeness proof and a reconciliation run BEFORE the attacks would be
 * anchored to a ledger head the attacks then moved past.
 *
 * Takes 10-20 minutes: it is twelve ticks back to back. Run it overnight, or at
 * minimum an hour before the room. Nothing else may write to the database while
 * it runs — not the test suite, not a second process — or the chain forks. See
 * the chain-break rows in docs/runbook.md.
 */
import { db } from "../lib/db/client";
import { resetDatabase, seedDatabase } from "../lib/db/seed";
import { runTick } from "../app/api/tick/runner";
import { runGauntlet, runMatrix } from "../app/api/gauntlet/runner";
import { recordGauntlet, summarizeMatrix } from "../lib/gauntlet";
import { attestReconciliation } from "../lib/reconcile/attest";
import { verifiedChain } from "../lib/ledger";

async function main() {
  await resetDatabase();
  await seedDatabase();
  console.log("reseeded");

  const tick = await runTick();
  console.log(`operational tick: ${tick.processed} processed ${JSON.stringify(tick.outcomes)}`);

  const run = await runGauntlet();
  console.log(`gauntlet: ${run.results.filter((r) => r.verdict === "DEFENDED" || r.verdict === "BREACHED").length} attacks run`);

  const { run: rec } = await attestReconciliation();
  console.log(`reconciliation: ${rec.status}`);

  const matrix = summarizeMatrix(await runMatrix());
  console.log(`matrix: ${matrix.rows.length} rows across ${matrix.proposers.filter((p) => p.available).length} proposers`);

  const { subject } = await recordGauntlet(run, matrix);
  console.log(`record: ${subject.defended}/${subject.attempted} defended, ${subject.breached} breached`);

  const chain = await verifiedChain();
  const bad = chain.filter((c) => c.status !== "VALID").length;
  console.log(`chain: ${chain.length} entries, ${bad} not valid`);
  console.log(subject.headline);
}
main().finally(() => db.$disconnect());
