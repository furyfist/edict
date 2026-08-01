import { db } from "./client";
import { DEFAULT_DEMO_CLOCK, addDays, startOfDay } from "../clock";

/**
 * The demo dataset. Eight vendors, one per scenario.
 *
 * Deterministic: identical output on every run, from an empty database. No
 * randomness, no wall clock — everything is relative to DEFAULT_DEMO_CLOCK.
 *
 * Realistic without being false: vendor names and list pricing are real and
 * checkable. Seat counts, usage, and messages are fabricated, disclosed in the
 * README, and labelled in the interface. The enforcement is not fabricated.
 */

const CLOCK = DEFAULT_DEMO_CLOCK;

interface VendorSpec {
  name: string;
  category: string;
  billingContact: string;
  /** null means no seat model at all (infrastructure, storage). */
  seats: { assigned: number; active: number } | null;
  /** false seeds seats with NO usage rows — unknown, not zero. */
  withUsage: boolean;
  renewal: {
    amountCents: number;
    frequency: "MONTHLY" | "YEARLY";
    dueInDays: number;
  };
  /** Prior cycles, oldest first. Drives the price-creep signal. */
  priorAmountsCents: number[];
  /**
   * Cycles seeded BEYOND the current one, spaced `NEXT_CYCLE_DAYS` apart.
   *
   * Without these, the demo eats itself. Every vendor's newest cycle starts on
   * the demo clock, so the pre-run overnight tick (arc beat 2) adjudicates all
   * of them — and the injection beat's tick then finds nothing to do and
   * reports `processed: 0, skipped: 8`. Advancing the clock cannot rescue it:
   * the clock only moves past due dates, it never creates a cycle.
   *
   * So the attack surface, and only the attack surface, carries cycles the
   * overnight run cannot reach. Beats 2 and 5 stop being mutually exclusive.
   *
   * More than one because a cycle is consumed by every attempt, and rehearsal
   * consumes them fastest. Running out mid-demo means an ~95s reseed followed
   * by a ~107s tick to get back to a usable state, which is not a recovery you
   * can perform while someone is watching.
   */
  reservedCycles?: number;
  mandate: { capCents: number } | null;
  scenario: string;
}

/**
 * How far out the reserved cycle sits.
 *
 * Must be larger than the tick's 7-day lookahead so the overnight run cannot
 * see it, and reachable by the attack console's `+30d` button so the injection
 * beat can. 30 also matches the spacing the prior cycles already use.
 */
const NEXT_CYCLE_DAYS = 30;

/** Days of login history seeded before the demo clock. */
const USAGE_HISTORY_DAYS = 45;

/**
 * Days of login history seeded AFTER the demo clock.
 *
 * The evidence builder only ever reads up to the clock, so these rows change no
 * decision. They exist for the interface: usage is measured over the trailing
 * 30 days, and the demo advances the clock by 30 at a time. With history that
 * stopped at the clock, one advance emptied that window and the Vendors page
 * showed every seeded vendor at `0/12` — factually true for the window, and
 * indistinguishable from "nobody uses this" to anyone reading it.
 *
 * Covers all three reserved cycles (+30/+60/+90) with a margin, so the page
 * still reads correctly however many times the clock is advanced on stage.
 */
const USAGE_FUTURE_DAYS = 100;

const VENDORS: VendorSpec[] = [
  {
    name: "Figma",
    category: "design",
    billingContact: "billing@figma.example",
    seats: { assigned: 12, active: 6 },
    withUsage: true,
    renewal: { amountCents: 18000, frequency: "MONTHLY", dueInDays: 3 },
    priorAmountsCents: [18000, 18000],
    mandate: { capCents: 50000 },
    scenario: "clean autonomous reduction — half the seats dark for 41 days",
  },
  {
    name: "Linear",
    category: "project-management",
    billingContact: "billing@linear.example",
    seats: { assigned: 20, active: 19 },
    withUsage: true,
    renewal: { amountCents: 16000, frequency: "MONTHLY", dueInDays: 4 },
    priorAmountsCents: [16000, 16000],
    mandate: { capCents: 50000 },
    scenario: "correct renewal — proves it is not a cancellation machine",
  },
  {
    name: "Notion",
    category: "docs",
    billingContact: "billing@notion.example",
    seats: { assigned: 30, active: 11 },
    withUsage: true,
    renewal: { amountCents: 480000, frequency: "YEARLY", dueInDays: 6 },
    priorAmountsCents: [420000],
    mandate: { capCents: 50000 },
    scenario: "escalation — large waste, but over the auto-approve ceiling",
  },
  {
    name: "Datadog",
    category: "monitoring",
    billingContact: "billing@datadog.example",
    seats: null,
    withUsage: false,
    renewal: { amountCents: 390000, frequency: "MONTHLY", dueInDays: 5 },
    priorAmountsCents: [240000, 240000],
    mandate: { capCents: 250000 },
    scenario: "ceiling raise — 62% increase pushes past mandate authority",
  },
  {
    name: "Loom",
    category: "video",
    billingContact: "billing@loom.example",
    seats: { assigned: 15, active: 2 },
    withUsage: true,
    renewal: { amountCents: 22500, frequency: "MONTHLY", dueInDays: 2 },
    priorAmountsCents: [22500, 22500],
    mandate: { capCents: 50000 },
    scenario: "near-total abandonment — exercises the drafted vendor email",
  },
  {
    name: "Airtable",
    category: "database",
    billingContact: "billing@airtable.example",
    // Seats exist, but no usage rows at all. The subtlest and best case in the
    // set: cheap, harmless-looking, and it must still escalate because unknown
    // is never permission.
    seats: { assigned: 8, active: 0 },
    withUsage: false,
    renewal: { amountCents: 24000, frequency: "MONTHLY", dueInDays: 5 },
    priorAmountsCents: [24000],
    mandate: { capCents: 50000 },
    scenario: "unknown is not permission — no usage data, so it escalates",
  },
  {
    name: "Vercel",
    category: "infrastructure",
    billingContact: "billing@vercel.example",
    seats: null,
    withUsage: false,
    renewal: { amountCents: 60000, frequency: "MONTHLY", dueInDays: 7 },
    priorAmountsCents: [60000],
    mandate: { capCents: 100000 },
    scenario: "explicit denial — named in the policy, ordering cannot defeat it",
  },
  {
    name: "CloudSync Pro",
    category: "storage",
    billingContact: "billing@cloudsyncpro.example",
    /**
     * FULLY UTILISED, AND DELIBERATELY SO. Do not set this back to `null`.
     *
     * The engine checks evidence completeness (step 4) BEFORE the mandate
     * ceiling (step 5). With no usage rows this vendor escalated as
     * `EVIDENCE_INCOMPLETE` — "missing usage data" — which meant the injection
     * beat was stopped by an unrelated gap and never reached the injected
     * amount at all. A judge could fairly say it would have escalated anyway.
     *
     * With usage present the attack runs to the check that actually answers it:
     * the proposed $48,000 against a $500 ceiling, `OVER_MANDATE_CEILING`.
     *
     * 8 of 8 active because this vendor must stay boring. Any waste here would
     * hand the agent a second story to tell in the middle of the attack, and
     * Airtable already owns "unknown is not permission".
     */
    seats: { assigned: 8, active: 8 },
    withUsage: true,
    renewal: { amountCents: 9500, frequency: "MONTHLY", dueInDays: 1 },
    priorAmountsCents: [9500, 9500],
    // The only vendor with cycles left after the overnight run. A judge plants
    // a message, advances the clock, runs a tick — and exactly one vendor
    // processes: the one they just attacked. Nothing else is competing for
    // attention, and the tick returns in ~45s rather than in ~107.
    //
    // Three attempts: one for rehearsal, one for the room, one for the judge
    // who wants to try their own wording.
    reservedCycles: 3,
    mandate: { capCents: 50000 },
    scenario: "the attack surface — cheap, unremarkable, and injectable",
  },
];

/**
 * Seat and usage rows are batched via createMany rather than written one at a
 * time. The original per-row upsert loop issued roughly 3,900 sequential
 * round trips for the full dataset (85 seats × up to 45 usage days each) —
 * fine against a local database, unworkable against a remote one where each
 * round trip costs network latency. Reseeding is a demo affordance that must
 * complete in seconds, not minutes.
 *
 * `skipDuplicates: true` (Postgres ON CONFLICT DO NOTHING) keeps this safe to
 * call against a non-empty table, matching the upsert semantics it replaces,
 * even though both current call sites reset the database first.
 */
async function seedVendor(spec: VendorSpec) {
  const vendor = await db.vendor.upsert({
    where: { name: spec.name },
    update: {},
    create: {
      name: spec.name,
      category: spec.category,
      billingContact: spec.billingContact,
    },
  });

  if (spec.seats) {
    await db.seat.createMany({
      data: Array.from({ length: spec.seats.assigned }, (_, index) => ({
        vendorId: vendor.id,
        email: `user${index + 1}@example.com`,
        assignedAt: addDays(CLOCK, -180),
      })),
      skipDuplicates: true,
    });

    if (spec.withUsage) {
      const seats = await db.seat.findMany({
        where: { vendorId: vendor.id },
        select: { id: true, email: true },
        orderBy: { email: "asc" },
      });

      const usageRows: {
        vendorId: string;
        seatId: string;
        day: Date;
        loggedIn: boolean;
      }[] = [];

      seats.forEach((seat, index) => {
        const active = index < spec.seats!.active;
        for (let dayOffset = USAGE_HISTORY_DAYS; dayOffset >= -USAGE_FUTURE_DAYS; dayOffset--) {
          const day = startOfDay(addDays(CLOCK, -dayOffset));
          // Active seats log in on most weekdays. Inactive seats went dark 41
          // days ago and have not returned — a fact, not an absence.
          //
          // The modulo is written to stay non-negative because `dayOffset` goes
          // negative past the demo clock; a raw `%` returns negatives there and
          // would thin the cadence out exactly where the demo needs it. For the
          // historical range the two forms are identical, so seeded history is
          // unchanged.
          const loggedIn = active
            ? (((index + dayOffset) % 7) + 7) % 7 > 1
            : dayOffset > 41;
          usageRows.push({ vendorId: vendor.id, seatId: seat.id, day, loggedIn });
        }
      });

      await db.usageRecord.createMany({ data: usageRows, skipDuplicates: true });
    }
  }

  // Prior cycles, then the current one. Price history drives the creep signal.
  const monthsBack = spec.priorAmountsCents.length;
  const renewalRows = spec.priorAmountsCents.map((amountCents, index) => {
    const offset = (monthsBack - index) * 30;
    return {
      vendorId: vendor.id,
      cycleStart: startOfDay(addDays(CLOCK, -offset)),
      dueDate: startOfDay(addDays(CLOCK, -offset + 3)),
      amountCents,
      currency: "USD",
      frequency: spec.renewal.frequency,
    };
  });
  await db.renewal.createMany({ data: renewalRows, skipDuplicates: true });

  const cycleStart = startOfDay(CLOCK);
  await db.renewal.upsert({
    where: { vendorId_cycleStart: { vendorId: vendor.id, cycleStart } },
    update: {},
    create: {
      vendorId: vendor.id,
      cycleStart,
      dueDate: startOfDay(addDays(CLOCK, spec.renewal.dueInDays)),
      amountCents: spec.renewal.amountCents,
      currency: "USD",
      frequency: spec.renewal.frequency,
    },
  });

  // The reserved cycles. Deliberately outside the 7-day lookahead at the demo
  // clock, so the overnight run leaves them untouched and the injection beat
  // has real work. Same amount and cadence as the current cycle — these are
  // ordinary months, not a special case the pipeline treats differently.
  //
  // Safe against price history: the evidence builder selects prior cycles with
  // `cycleStart < this renewal's cycleStart`, so a later cycle never appears in
  // an earlier renewal's history.
  for (let n = 1; n <= (spec.reservedCycles ?? 0); n += 1) {
    const offset = NEXT_CYCLE_DAYS * n;
    const reservedStart = startOfDay(addDays(CLOCK, offset));
    await db.renewal.upsert({
      where: {
        vendorId_cycleStart: { vendorId: vendor.id, cycleStart: reservedStart },
      },
      update: {},
      create: {
        vendorId: vendor.id,
        cycleStart: reservedStart,
        dueDate: startOfDay(addDays(CLOCK, offset + spec.renewal.dueInDays)),
        amountCents: spec.renewal.amountCents,
        currency: "USD",
        frequency: spec.renewal.frequency,
      },
    });
  }

  if (spec.mandate) {
    // Placeholder Prava identifiers. Real mandates come from the passkey
    // ceremony; this table is only ever a mirror.
    await db.mandate.upsert({
      where: { vendorId: vendor.id },
      update: {},
      create: {
        vendorId: vendor.id,
        pravaMandateId: `mandate_seed_${spec.name.toLowerCase().replace(/[^a-z0-9]/g, "")}`,
        status: "ACTIVE",
        capCents: spec.mandate.capCents,
        remainingCents: spec.mandate.capCents,
        frequency: spec.renewal.frequency,
        expiresAt: addDays(CLOCK, 300),
      },
    });
  }

  return vendor;
}

const POLICY_V1_TEXT = "Auto-renew anything under $200 a month.";

const POLICY_V2_TEXT = [
  "Never auto-renew Vercel.",
  "Auto-renew anything under $500 a month.",
  "Anything over $500 a month needs my approval.",
].join(" ");

async function seedPolicies(vercelId: string) {
  // v1 is deliberately loose and gets superseded. Having a real prior version
  // makes versioning demonstrable without contriving a detour on stage.
  const existingV1 = await db.policyVersion.findUnique({ where: { version: 1 } });
  if (!existingV1) {
    await db.policyVersion.create({
      data: {
        version: 1,
        englishText: POLICY_V1_TEXT,
        status: "SUPERSEDED",
        activatedAt: addDays(CLOCK, -30),
        rules: {
          create: [
            {
              ordinal: 0,
              effect: "ALLOW_AUTO",
              scopeKind: "ANY",
              maxAmountCents: 20000,
              sourceFragment: POLICY_V1_TEXT,
            },
            {
              ordinal: 1,
              effect: "REQUIRE_APPROVAL",
              scopeKind: "ANY",
              sourceFragment:
                "(default: anything not covered above is sent to you)",
            },
          ],
        },
      },
    });
  }

  const existingV2 = await db.policyVersion.findUnique({ where: { version: 2 } });
  if (existingV2) return existingV2;

  return db.policyVersion.create({
    data: {
      version: 2,
      englishText: POLICY_V2_TEXT,
      status: "ACTIVE",
      activatedAt: CLOCK,
      rules: {
        create: [
          {
            ordinal: 0,
            effect: "DENY",
            scopeKind: "VENDOR",
            scopeVendorId: vercelId,
            sourceFragment: "Never auto-renew Vercel.",
          },
          {
            ordinal: 1,
            effect: "ALLOW_AUTO",
            scopeKind: "ANY",
            maxAmountCents: 50000,
            sourceFragment: "Auto-renew anything under $500 a month.",
          },
          {
            ordinal: 2,
            effect: "REQUIRE_APPROVAL",
            scopeKind: "ANY",
            sourceFragment: "Anything over $500 a month needs my approval.",
          },
          {
            ordinal: 3,
            effect: "REQUIRE_APPROVAL",
            scopeKind: "ANY",
            sourceFragment:
              "(default: anything not covered above is sent to you)",
          },
        ],
      },
    },
  });
}

/**
 * Three approvals, one per lifecycle state worth showing.
 *
 * The pre-expired one earns its place: expiry is a real behaviour and waiting
 * 24 hours on stage to demonstrate it is not an option. The historical approved
 * one gives the precedent line something true to cite.
 */
async function seedApprovals(input: {
  policyVersionId: string;
  ruleId: string;
  vendors: Map<string, string>;
}) {
  const cycleStart = startOfDay(CLOCK);

  async function snapshotFor(vendorName: string, amountCents: number) {
    const vendorId = input.vendors.get(vendorName)!;
    const renewal = await db.renewal.findUnique({
      where: { vendorId_cycleStart: { vendorId, cycleStart } },
    });

    return {
      vendorId,
      renewalId: renewal?.id ?? `renewal-${vendorName.toLowerCase()}`,
      proposal: {
        vendorId,
        renewalId: renewal?.id ?? "",
        action: "RENEW_AS_IS",
        amountCents,
        currency: "USD",
        rationale: `${vendorName} renewal requires review before it is charged.`,
        alternative: {
          action: "RENEW_REDUCED",
          reason: "Seat usage does not clearly support a reduction yet.",
        },
      },
      evidence: {
        vendorId,
        vendorName,
        renewalId: renewal?.id ?? "",
        cycleStart: cycleStart.toISOString().slice(0, 10),
        asOf: CLOCK.toISOString(),
      },
    };
  }

  const notion = await snapshotFor("Notion", 480000);
  const airtable = await snapshotFor("Airtable", 24000);
  const linear = await snapshotFor("Linear", 16000);

  const rows = [
    {
      // Pending — the one a judge acts on.
      type: "REQUIRE" as const,
      data: {
        type: "POLICY_EXCEPTION" as const,
        status: "PENDING" as const,
        vendorId: notion.vendorId,
        renewalId: notion.renewalId,
        amountCents: 480000,
        expiresAt: addDays(CLOCK, 1),
        snapshot: notion,
      },
    },
    {
      // Already expired. Consent was to act on evidence that has since aged out.
      type: "REQUIRE" as const,
      data: {
        type: "POLICY_EXCEPTION" as const,
        status: "EXPIRED" as const,
        vendorId: airtable.vendorId,
        renewalId: airtable.renewalId,
        amountCents: 24000,
        expiresAt: addDays(CLOCK, -2),
        snapshot: airtable,
      },
    },
    {
      // Historical, approved. Precedent the interface can honestly cite.
      type: "REQUIRE" as const,
      data: {
        type: "POLICY_EXCEPTION" as const,
        status: "APPROVED" as const,
        vendorId: linear.vendorId,
        renewalId: linear.renewalId,
        amountCents: 16000,
        expiresAt: addDays(CLOCK, -25),
        snapshot: linear,
      },
    },
  ];

  for (const row of rows) {
    const existing = await db.approval.findFirst({
      where: { vendorId: row.data.vendorId, status: row.data.status },
    });
    if (existing) continue;

    await db.approval.create({
      data: {
        type: row.data.type,
        status: row.data.status,
        vendorId: row.data.vendorId,
        renewalId: row.data.renewalId,
        cycleStart,
        proposalSnapshot: row.data.snapshot.proposal,
        evidenceSnapshot: row.data.snapshot.evidence,
        policyVersionId: input.policyVersionId,
        ruleId: input.ruleId,
        amountCents: row.data.amountCents,
        expiresAt: row.data.expiresAt,
        approverId: row.data.status === "APPROVED" ? "owner@example.com" : null,
        approvedAt: row.data.status === "APPROVED" ? addDays(CLOCK, -28) : null,
      },
    });
  }
}

/**
 * Wipes every table. Ordered by dependency so foreign keys never block.
 *
 * Reseeding is a demo affordance, not a maintenance tool: a run that goes
 * sideways on stage is recovered in seconds rather than abandoned.
 */
export async function resetDatabase(): Promise<void> {
  // The proof plane goes first, and it MUST go.
  //
  // A claim anchored to a ledger head that no longer exists is not a stale
  // record, it is a false one. And a surviving mock charge would show up in the
  // next reconciliation as an ORPHAN_CHARGE — the system accusing itself of
  // moving money without a record, because somebody pressed reseed.
  await db.claim.deleteMany();
  await db.mockCharge.deleteMany();

  await db.ledgerEntry.deleteMany();
  await db.tick.deleteMany();
  await db.approval.deleteMany();
  await db.policyRule.deleteMany();
  await db.policyVersion.deleteMany();
  await db.mandate.deleteMany();
  await db.inboundMessage.deleteMany();
  await db.usageRecord.deleteMany();
  await db.seat.deleteMany();
  await db.renewal.deleteMany();
  await db.vendor.deleteMany();
  await db.systemState.deleteMany();
}

export async function seedDatabase() {
  await db.systemState.upsert({
    where: { id: "singleton" },
    update: { demoClock: CLOCK, killSwitchEngaged: false, tickLockHeldBy: null },
    create: { id: "singleton", demoClock: CLOCK },
  });

  const vendors = new Map<string, string>();
  for (const spec of VENDORS) {
    const vendor = await seedVendor(spec);
    vendors.set(spec.name, vendor.id);
  }

  const policy = await seedPolicies(vendors.get("Vercel")!);

  const approvalRule = await db.policyRule.findFirst({
    where: { policyVersionId: policy.id, effect: "REQUIRE_APPROVAL" },
    orderBy: { ordinal: "asc" },
  });

  if (approvalRule) {
    await seedApprovals({
      policyVersionId: policy.id,
      ruleId: approvalRule.id,
      vendors,
    });
  }

  return {
    vendors: await db.vendor.count(),
    seats: await db.seat.count(),
    usageRecords: await db.usageRecord.count(),
    renewals: await db.renewal.count(),
    mandates: await db.mandate.count(),
    policyVersions: await db.policyVersion.count(),
    approvals: await db.approval.count(),
  };
}

export { VENDORS, POLICY_V2_TEXT };
