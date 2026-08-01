/** One-off: measure reset vs seed separately, to target the real bottleneck. */
import { db } from "../lib/db/client";
import { resetDatabase, seedDatabase } from "../lib/db/seed";

async function main() {
  let t = Date.now();
  await resetDatabase();
  console.log("resetDatabase:", Date.now() - t, "ms");

  t = Date.now();
  await seedDatabase();
  console.log("seedDatabase: ", Date.now() - t, "ms");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
