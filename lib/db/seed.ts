import { prisma } from "./client";
import { DEMO_EPOCH, plusDays, seedClock } from "../clock";
import { MockPravaAdapter } from "../prava/mock";

/**
 * The demo dataset.
 *
 * Eight vendors, two policy versions, and a set of scenarios that between them
 * reach every outcome the architecture defines. Nothing here is decorative:
 * each vendor exists because it exercises a code path the demo needs to show.
 *
 * Reproducibility is the property that matters most. All ids are explicit, all
 * timestamps derive from the fixed demo epoch, the mock adapter derives its
 * identifiers from their inputs, and nothing reads wall time or randomness —
 * so running the seed twice from empty produces identical rows, and "reset to
 * a clean state" means byte-identical rather than approximately similar.
 */

interface VendorSeed {
  id: string;
  name: string;
  category: string;
  merchantId: string | null;
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

/**
 * The full dataset.
 *
 * Eight vendors, each producing one specified scenario, and between them every
 * outcome class the architecture defines appears at least once. This is built
 * last on purpose: it targets a finished system rather than being maintained
 * against a moving one, and the scenarios are chosen to exercise real code
 * paths rather than to look varied.
 */
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
  {
    id: "vendor_linear",
    name: "Linear",
    category: "project-management",
    merchantId: "merchant_linear",
    renewal: {
      id: "renewal_linear_2025_03",
      dueInDays: 2,
      amountCents: 32_00,
      cadence: "MONTHLY",
      cycleKey: "2025-03",
      priorCycleAmountCents: 32_00,
      previousAmountCents: 32_00,
    },
    seats: { licensed: 12, active: 12, dormant: 0 },
    scenario: "allow — the boring case, which is most of them",
  },
  {
    id: "vendor_notion",
    name: "Notion",
    category: "docs",
    merchantId: "merchant_notion",
    renewal: {
      id: "renewal_notion_2025_03",
      dueInDays: 3,
      amountCents: 96_00,
      cadence: "MONTHLY",
      cycleKey: "2025-03",
      priorCycleAmountCents: 96_00,
      previousAmountCents: 96_00,
    },
    // 40% dormant. Under the ceiling, so it renews — but the agent proposes a
    // seat reduction and the ledger shows what it noticed.
    seats: { licensed: 30, active: 18, dormant: 12 },
    scenario: "allow with a seat reduction — 40% of seats dormant",
  },
  {
    id: "vendor_loom",
    name: "Loom",
    category: "video",
    merchantId: "merchant_loom",
    renewal: {
      id: "renewal_loom_2025_03",
      dueInDays: 5,
      amountCents: 150_00,
      cadence: "MONTHLY",
      cycleKey: "2025-03",
      priorCycleAmountCents: 150_00,
      previousAmountCents: 150_00,
    },
    // No seat record at all. Above the auto ceiling and missing evidence:
    // escalates for the missing-evidence reason rather than the amount.
    seats: null,
    scenario: "escalate — missing evidence, above the auto ceiling",
  },
  {
    id: "vendor_airtable",
    name: "Airtable",
    category: "database",
    merchantId: "merchant_airtable",
    renewal: {
      id: "renewal_airtable_2025_03",
      dueInDays: 4,
      amountCents: 240_00,
      cadence: "MONTHLY",
      cycleKey: "2025-03",
      priorCycleAmountCents: 200_00,
      previousAmountCents: 200_00,
    },
    // Exactly 20% — above the 15% threshold, so the price rule fires before
    // the amount rule. The refusal cites the increase, not the amount.
    seats: { licensed: 25, active: 22, dormant: 3 },
    scenario: "escalate — a 20% price increase, cited over the amount",
  },
  {
    id: "vendor_vercel",
    name: "Vercel",
    category: "hosting",
    // No merchant id. Nothing to pin a mandate to, so it cannot be paid
    // unattended however small the amount is.
    merchantId: null,
    renewal: {
      id: "renewal_vercel_2025_03",
      dueInDays: 6,
      amountCents: 20_00,
      cadence: "MONTHLY",
      cycleKey: "2025-03",
      priorCycleAmountCents: 20_00,
      previousAmountCents: 20_00,
    },
    seats: { licensed: 8, active: 8, dormant: 0 },
    scenario: "escalate — small and well-used, but no payment merchant",
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

/**
 * The starting policy, written the way a finance lead would write it. The rules
 * below are the compiled form of exactly these sentences, and each rule carries
 * the sentence it came from so a refusal can quote it back.
 */
export const SEED_POLICY_TEXT = [
  "Never renew anything from CloudSync Pro.",
  "Renew anything under $100 automatically.",
  "Anything with a price increase above 15% needs my approval.",
  "Anything over $500 needs my approval.",
].join("\n");

async function seedPolicy(): Promise<void> {
  const version = await prisma.policyVersion.create({
    data: {
      version: 1,
      sourceText: SEED_POLICY_TEXT,
      status: "ACTIVE",
      createdAt: DEMO_EPOCH,
      activatedAt: DEMO_EPOCH,
      activatedBy: "user:finance-lead",
    },
  });

  await prisma.policyRule.createMany({
    data: [
      {
        policyVersionId: version.id,
        ordinal: 1,
        effect: "DENY",
        conditions: [
          { field: "VENDOR_ID", operator: "EQ", value: "vendor_cloudsync" },
        ],
        amountCeilingCents: null,
        sourceFragment: "Never renew anything from CloudSync Pro.",
        description: "Deny every renewal for CloudSync Pro.",
      },
      {
        policyVersionId: version.id,
        ordinal: 2,
        effect: "REQUIRE_APPROVAL",
        conditions: [
          {
            field: "PRICE_INCREASE_BASIS_POINTS",
            operator: "GT",
            value: 1500,
          },
        ],
        amountCeilingCents: null,
        sourceFragment:
          "Anything with a price increase above 15% needs my approval.",
        description: "Escalate renewals whose price rose by more than 15%.",
      },
      {
        policyVersionId: version.id,
        ordinal: 3,
        effect: "REQUIRE_APPROVAL",
        conditions: [{ field: "AMOUNT", operator: "GT", value: 500_00 }],
        amountCeilingCents: null,
        sourceFragment: "Anything over $500 needs my approval.",
        description: "Escalate renewals above $500.00.",
      },
      {
        policyVersionId: version.id,
        ordinal: 4,
        effect: "ALLOW_AUTO",
        conditions: [{ field: "AMOUNT", operator: "LTE", value: 100_00 }],
        // Every ALLOW_AUTO rule carries a ceiling. An allow rule without one is
        // unbounded authority and the compiler refuses to produce it.
        amountCeilingCents: 100_00,
        sourceFragment: "Renew anything under $100 automatically.",
        description: "Auto-renew charges at or below $100.00.",
      },
    ],
  });
}

/** One mandate per vendor, sized to what the policy could ever permit. */
async function seedMandates(): Promise<void> {
  const adapter = new MockPravaAdapter();
  for (const v of SKELETON_VENDORS) {
    // A vendor with no merchant has nothing to pin a mandate to, so no
    // mandate is created. The engine escalates it for the missing merchant,
    // and the outcome router would refuse it for the absent mandate — two
    // independent reasons the same charge does not happen.
    if (!v.merchantId) continue;
    await adapter.createMandate({
      vendorId: v.id,
      merchantId: v.merchantId,
      amountCeilingCents: 500_00,
      currency: "USD",
      expiresAt: plusDays(DEMO_EPOCH, 90).toISOString(),
    });
  }
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

  await seedPolicy();
  await seedMandates();
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
