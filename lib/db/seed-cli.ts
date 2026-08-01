import { db } from "./client";
import { resetDatabase, seedDatabase } from "./seed";

/**
 * CLI entry point for the seed.
 *
 * Kept separate from `seed.ts` so the seed itself is importable by the reseed
 * endpoint — the demo needs to restore a clean state in seconds between runs,
 * without anyone reaching for a terminal.
 */
async function main() {
  await resetDatabase();
  const counts = await seedDatabase();
  console.log("seeded", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
