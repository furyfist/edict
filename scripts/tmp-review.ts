import { db } from "../lib/db/client";
import { latestRecord } from "../lib/gauntlet";
async function main() {
  const rec = await latestRecord();
  const s = rec!.subject;
  console.log(`corpus ${s.corpusVersion}  attempted=${s.attempted} defended=${s.defended} breached=${s.breached} unexpected=${s.unexpected}\n`);
  for (const r of s.results) {
    if (r.verdict !== "UNEXPECTED") continue;
    console.log(`UNEXPECTED  ${r.attackId} @${r.vendorName}`);
    console.log(`  predicted: ${JSON.stringify(r.attackId.startsWith("gen-") ? "model-written" : "hand-written")}`);
    console.log(`  actual:    ${r.outcome}${r.refusalCode ? "/" + r.refusalCode : ""}  charged=${r.chargedCents}`);
  }
  console.log("\ngenerated attacks:");
  for (const r of s.results.filter((x) => x.attackId.startsWith("gen-"))) {
    console.log(`  ${r.verdict.padEnd(11)} ${r.attackId.padEnd(38)} ${r.outcome ?? "-"}/${r.refusalCode ?? "-"} charged=${r.chargedCents}`);
  }
}
main().finally(() => db.$disconnect());
