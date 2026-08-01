import { prisma } from "./client";
import { DEMO_EPOCH, plusDays, seedClock } from "../clock";

/**
 * Seed skeleton.
 *
 * Three vendors, one for each of the three outcomes the policy engine can
 * reach: one that auto-renews, one that escalates for approval, and one that is
 * denied outright. Every workstream gets real rows immediately.
 *
 * Reproducibility is the property that matters here. All ids are explicit, all
 * timestamps derive from the fixed demo epoch, and nothing reads wall time or
 * randomness — running the seed twice from empty produces identical rows.
 *
 * This grows into the full eight-vendor dataset in M4, deliberately last, so it
 * targets a finished system rather than being maintained against a moving one.
 */

interface VendorSeed {
  id: string;
  name: string;
  category: string;
  merchantId: string;
  renewal: {
    id: string;
    dueInDays: number;
    amountCents: number;
    cadence: "MONTHLY" | "QUARTERLY" | "ANNUAL";
    cycleKey: string;
    priorCycleAmountCents: number | null;
    previousAmountCents: number | null;
  };
  seats: { licensed: number; active: number; dormant: number } | null;
  /** Why this vendor is in the skeleton — which outcome it exercises. */
  scenario: string;
}

export const SKELETON_VENDORS: VendorSeed[] = [
  {
    id: "vendor_figma",
    name: "Figma",
    category: "design",
    merchantId: "merchant_figma",
    renewal: {
      id: "renewal_figma_2025_03",
      dueInDays: 2,
      amountCents: 45_00,
      cadence: "MONTHLY",
      cycleKey: "2025-03",
      priorCycleAmountCents: 45_00,
      previousAmountCents: 45_00,
    },
    seats: { licensed: 20, active: 18, dormant: 2 },
    scenario: "allow — small, unchanged, well-used",
  },
  {
    id: "vendor_datadog",
    name: "Datadog",
    category: "observability",
    merchantId: "merchant_datadog",
    renewal: {
      id: "renewal_datadog_2025_03",
      dueInDays: 3,
      amountCents: 1_240_00,
      cadence: "MONTHLY",
      cycleKey: "2025-03",
      priorCycleAmountCents: 980_00,
      previousAmountCents: 980_00,
    },
    seats: { licensed: 40, active: 31, dormant: 9 },
    scenario: "escalate — large, and a 26% price increase",
  },
  {
    id: "vendor_cloudsync",
    name: "CloudSync Pro",
    category: "storage",
    merchantId: "merchant_cloudsync",
    renewal: {
      id: "renewal_cloudsync_2025_03",
      dueInDays: 4,
      amountCents: 3_600_00,
      cadence: "ANNUAL",
      cycleKey: "2025",
      priorCycleAmountCents: null,
      previousAmountCents: null,
    },
    seats: null,
    scenario: "deny — no usage data at all, and an amount well over any ceiling",
  },
];

/** Delete everything, in dependency order. Seeds always start from empty. */
async function clear(): Promise<void> {
  await prisma.ledgerEntry.deleteMany();
  await prisma.approvalRequest.deleteMany();
  await prisma.tickRun.deleteMany();
  await prisma.policyRule.deleteMany();
  await prisma.policyVersion.deleteMany();
  await prisma.mandate.deleteMany();
  await prisma.vendorMessage.deleteMany();
  await prisma.usageRecord.deleteMany();
  await prisma.seatRecord.deleteMany();
  await prisma.renewal.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.systemState.deleteMany();
}

export async function seed(): Promise<void> {
  await clear();
  await seedClock();

  for (const v of SKELETON_VENDORS) {
    await prisma.vendor.create({
      data: {
        id: v.id,
        name: v.name,
        category: v.category,
        merchantId: v.merchantId,
      },
    });

    await prisma.renewal.create({
      data: {
        id: v.renewal.id,
        vendorId: v.id,
        dueAt: plusDays(DEMO_EPOCH, v.renewal.dueInDays),
        amountCents: v.renewal.amountCents,
        cadence: v.renewal.cadence,
        cycleKey: v.renewal.cycleKey,
        priorCycleAmountCents: v.renewal.priorCycleAmountCents,
        previousAmountCents: v.renewal.previousAmountCents,
      },
    });

    if (v.seats) {
      await prisma.seatRecord.create({
        data: {
          vendorId: v.id,
          licensed: v.seats.licensed,
          active: v.seats.active,
          dormant: v.seats.dormant,
          windowDays: 30,
          observedAt: DEMO_EPOCH,
        },
      });
    }
  }
}

async function main(): Promise<void> {
  await seed();
  const vendors = await prisma.vendor.count();
  const renewals = await prisma.renewal.count();
  console.log(`seeded ${vendors} vendors, ${renewals} renewals`);
  for (const v of SKELETON_VENDORS) {
    console.log(`  ${v.name.padEnd(14)} ${v.scenario}`);
  }
}

if (process.argv[1] && process.argv[1].includes("seed")) {
  main()
    .then(() => prisma.$disconnect())
    .catch(async (error) => {
      console.error(error);
      await prisma.$disconnect();
      process.exit(1);
    });
}
