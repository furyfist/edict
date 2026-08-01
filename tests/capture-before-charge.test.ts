import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Capture-before-charge, verified against a killed adapter.
 *
 * The property: if the adapter is killed mid-charge, the ledger still holds a
 * record of the attempt. Money that moved is never invisible.
 *
 * The database is faked here rather than provisioned. What is under test is the
 * ordering of two writes around one call, and that ordering is a property of
 * `lib/outcome` and `lib/ledger` — a real Postgres would exercise the same code
 * path and answer the same question, at the cost of an external dependency in
 * the test suite.
 */

interface FakeEntry {
  id: string;
  outcome: string;
  amountCents: number | null;
  pravaMandateId: string | null;
  pravaChargeId: string | null;
  detail: Record<string, unknown>;
  renewalId: string | null;
  cycleKey: string | null;
}

const entries: FakeEntry[] = [];
let nextId = 1;

const prismaMock = {
  ledgerEntry: {
    create: vi.fn(async ({ data, select }: any) => {
      const duplicate = entries.find(
        (e) =>
          e.renewalId !== null &&
          e.renewalId === data.renewalId &&
          e.cycleKey === data.cycleKey,
      );
      if (duplicate) {
        const error: any = new Error("Unique constraint failed");
        error.code = "P2002";
        error.constructor = { name: "PrismaClientKnownRequestError" };
        Object.setPrototypeOf(error, PrismaKnownError.prototype);
        throw error;
      }
      const entry: FakeEntry = {
        id: `entry_${nextId++}`,
        outcome: data.outcome,
        amountCents: data.amountCents ?? null,
        pravaMandateId: data.pravaMandateId ?? null,
        pravaChargeId: data.pravaChargeId ?? null,
        detail: data.detail ?? {},
        renewalId: data.renewalId ?? null,
        cycleKey: data.cycleKey ?? null,
      };
      entries.push(entry);
      return select ? { id: entry.id } : entry;
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      return entries.find((e) => e.id === where.id) ?? null;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const entry = entries.find((e) => e.id === where.id);
      if (!entry) throw new Error("no such entry");
      Object.assign(entry, {
        outcome: data.outcome ?? entry.outcome,
        pravaChargeId: data.pravaChargeId ?? entry.pravaChargeId,
        detail: data.detail ?? entry.detail,
      });
      return entry;
    }),
    findFirst: vi.fn(async () => null),
    findMany: vi.fn(async () => entries),
  },
  approvalRequest: {
    findFirst: vi.fn(async () => null),
    create: vi.fn(async () => ({ id: "approval_1" })),
  },
};

class PrismaKnownError extends Error {
  code = "P2002";
}

vi.mock("@prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: PrismaKnownError,
  },
  PrismaClient: class {},
}));

vi.mock("../lib/db/client", () => ({ prisma: prismaMock }));

const { route } = await import("../lib/outcome");
const { fixtureEvidenceBundle, fixtureProposal, fixtureVerdict, resetFixtures } =
  await import("../lib/fixtures");

/** An adapter that reaches the network and then dies before answering. */
const killedAdapter = {
  mode: "mock" as const,
  charge: async () => {
    throw new Error("adapter killed mid-charge");
  },
  createMandate: async () => ({ ok: false, mandate: null, error: "n/a" }),
  getMandate: async () => ({ ok: false, mandate: null, error: "n/a" }),
  pauseMandate: async () => ({ ok: false, mandate: null, error: "n/a" }),
  resumeMandate: async () => ({ ok: false, mandate: null, error: "n/a" }),
  cancelMandate: async () => ({ ok: false, mandate: null, error: "n/a" }),
  listMandates: async () => [],
  health: async () => ({ healthy: true, detail: "test" }),
};

/** An adapter that declines. A decline is an answer, not a failure to answer. */
const decliningAdapter = {
  ...killedAdapter,
  charge: async () => ({
    ok: false as const,
    kind: "DECLINED" as const,
    networkMessage: "Amount exceeds the remaining authority on this mandate.",
    chargeId: null,
    sessionId: "ses_test",
  }),
};

function routeInput(overrides: Record<string, unknown> = {}) {
  const bundle = fixtureEvidenceBundle();
  return {
    tickId: "tick_test",
    recordedAt: new Date("2025-03-01T09:00:00.000Z"),
    bundle,
    proposal: fixtureProposal({ bundleId: bundle.bundleId }),
    verdict: fixtureVerdict({
      bundleId: bundle.bundleId,
      renewalId: bundle.renewal.id,
    }),
    mandateId: "mnd_test",
    ...overrides,
  } as Parameters<typeof route>[0];
}

beforeEach(() => {
  entries.length = 0;
  nextId = 1;
  resetFixtures();
});

describe("capture-before-charge", () => {
  it("killing the adapter mid-charge still leaves a recorded outcome", async () => {
    await expect(
      route({ ...routeInput(), adapter: killedAdapter as never }),
    ).rejects.toThrow("adapter killed mid-charge");

    // The intent was captured before the adapter was called, so it survived.
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.pravaMandateId).toBe("mnd_test");
    expect(entry.amountCents).toBe(45_00);
    // It reads as a charge whose result is unknown, which is the honest
    // reading, rather than as a success or a clean refusal.
    expect(entry.outcome).toBe("ADAPTER_FAILURE");
    expect(entry.detail.captureStage).toBe("INTENT");
  });

  it("records the amount and mandate before the network is contacted", async () => {
    let capturedWhenCharged: number | null = null;
    const observingAdapter = {
      ...killedAdapter,
      charge: async () => {
        // At the moment the network is contacted, the intent is already durable.
        capturedWhenCharged = entries.length;
        throw new Error("adapter killed mid-charge");
      },
    };

    await expect(
      route({ ...routeInput(), adapter: observingAdapter as never }),
    ).rejects.toThrow();

    expect(capturedWhenCharged).toBe(1);
  });

  it("a decline closes the intent as a network decline, with nothing charged", async () => {
    const result = await route({
      ...routeInput(),
      adapter: decliningAdapter as never,
    });

    expect(result.outcome).toBe("NETWORK_DECLINE");
    expect(entries).toHaveLength(1);
    expect(entries[0].outcome).toBe("NETWORK_DECLINE");
    expect(entries[0].detail.captureStage).toBe("CLOSED");
    expect(entries[0].detail.note).toBe("Nothing was charged.");
    expect(entries[0].detail.failureKind).toBe("DECLINED");
    expect(entries[0].pravaChargeId).toBeNull();
  });

  it("a decline is not retried", async () => {
    let calls = 0;
    const countingAdapter = {
      ...decliningAdapter,
      charge: async () => {
        calls += 1;
        return {
          ok: false as const,
          kind: "DECLINED" as const,
          networkMessage: "declined",
          chargeId: null,
          sessionId: null,
        };
      },
    };

    await route({ ...routeInput(), adapter: countingAdapter as never });
    expect(calls).toBe(1);
  });

  it("a timeout is retried exactly once", async () => {
    let calls = 0;
    const flakyAdapter = {
      ...decliningAdapter,
      charge: async () => {
        calls += 1;
        return {
          ok: false as const,
          kind: "TIMEOUT" as const,
          networkMessage: "timed out",
          chargeId: null,
          sessionId: null,
        };
      },
    };

    await route({ ...routeInput(), adapter: flakyAdapter as never });
    expect(calls).toBe(2);
  });
});

describe("every path ends in a visible entry", () => {
  it("a denial writes a refusal saying nothing was charged", async () => {
    const result = await route(
      routeInput({
        verdict: fixtureVerdict({
          decision: "DENY",
          reason: "DENIAL_PASS",
          permittedAmount: null,
        }),
      }),
    );

    expect(result.outcome).toBe("REFUSED");
    expect(entries).toHaveLength(1);
    expect(entries[0].detail.note).toBe("Nothing was charged.");
  });

  it("an escalation writes an entry and raises one approval", async () => {
    const result = await route(
      routeInput({
        verdict: fixtureVerdict({
          decision: "REQUIRE_APPROVAL",
          reason: "AMOUNT_EXCEEDS_CEILING",
          permittedAmount: null,
        }),
      }),
    );

    expect(result.outcome).toBe("ESCALATED");
    expect(prismaMock.approvalRequest.create).toHaveBeenCalledTimes(1);
    expect(entries).toHaveLength(1);
  });

  it("permission with no mandate refuses rather than charging", async () => {
    const result = await route(routeInput({ mandateId: null }));

    expect(result.outcome).toBe("REFUSED");
    expect(entries[0].detail.note).toBe("Nothing was charged.");
  });
});
