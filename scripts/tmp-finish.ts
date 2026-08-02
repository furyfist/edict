import { db } from "../lib/db/client";
import { runGauntlet } from "../app/api/gauntlet/runner";
import { recordGauntlet } from "../lib/gauntlet";
import { attestReconciliation } from "../lib/reconcile/attest";

async function main() {
  const run = await runGauntlet();
  const attacks = run.results.filter((r) => r.verdict === "DEFENDED" || r.verdict === "BREACHED").length;
  console.log(`gauntlet: ${attacks} attacks run`);
  const { run: rec } = await attestReconciliation();
  console.log(`reconciliation: ${rec.status}`);
  const { subject } = await recordGauntlet(run);
  console.log(`record: ${subject.defended}/${subject.attempted} defended, ${subject.breached} breached`);
  console.log(subject.headline);
}
main().finally(() => db.$disconnect());
