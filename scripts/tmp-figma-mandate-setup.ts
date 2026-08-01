/**
 * One-off operational script: open a real mandate-setup session for Figma.
 *
 * Throwaway — not committed, not part of the app. Reuses the real
 * openMandateSetup() function so this exercises the exact code path the
 * approvals UI uses, rather than duplicating logic.
 */
import { openMandateSetup } from "../lib/prava/mandates";
import { addDays, DEFAULT_DEMO_CLOCK } from "../lib/clock";
import { cents } from "../lib/contracts/money";

async function main() {
  const result = await openMandateSetup({
    vendorName: "Figma",
    ownerId: "owner-1",
    ownerEmail: "owner@example.com",
    capCents: cents(50000), // $500 — matches the seeded mandate cap
    frequency: "MONTHLY",
    validUntil: addDays(DEFAULT_DEMO_CLOCK, 300).toISOString(),
    maxCharges: 12,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
