import { randomUUID } from "node:crypto";
import { db } from "@/lib/db/client";
import { addDays, ensureSystemState, wallNow } from "@/lib/clock";
import { buildEvidenceBundle } from "@/lib/evidence";
import { activeAgent } from "@/lib/agent";
import { routeOutcome } from "@/lib/outcome";
import { appendEntry, hasEntryForCycle } from "@/lib/ledger";
import { paymentBoundary } from "@/lib/prava";
import { refreshAllMandates } from "@/lib/prava/mandates";
import { expireStaleApprovals } from "@/lib/outcome/approvals";
import { cents } from "@/lib/contracts/money";
import type { Frequency, Policy, PolicyRule } from "@/lib/contracts";

/**
 * The tick runner — unattended execution.
 *
 * One entry point, invoked three ways: an external cron, the manual trigger on
 * stage, and the fast-forward loop. IDENTICAL CODE PATH in all three. The demo
 * must never exercise code the cron does not, or the autonomy claim is false.
 *
 * Every date comes from the demo clock. Wall time is used only for the lock
 * timer and operational timestamps.
 */

const LOOKAHEAD_DAYS = 7;
/** A lock older than this is assumed abandoned by a crashed run. */
const LOCK_STALE_MINUTES = 5;

export interface TickReport {
  tickId: string | null;
  clockAt: string;
  halted: boolean;
  haltReason?: string;
  processed: number;
  /** Renewals already adjudicated for this cycle and therefore skipped. */
  skipped: number;
  outcomes: Record<string, number>;
}

function halted(
  clock: Date,
  haltReason: string,
  outcomes: Record<string, number>,
  tickId: string | null = null,
  processed = 0,
): TickReport {
  return {
    tickId,
    clockAt: clock.toISOString(),
    halted: true,
    haltReason,
    processed,
    skipped: 0,
    outcomes,
  };
}

/**
 * Single-flight lock. One tick at a time, no parallelism.
 *
 * Eight vendors do not need concurrency, and serializing removes an entire
 * class of race conditions for the price of one boolean.
 */
async function acquireLock(holder: string): Promise<boolean> {
  const staleBefore = new Date(wallNow().getTime() - LOCK_STALE_MINUTES * 60_000);

  const claimed = await db.systemState.updateMany({
    where: {
      id: "singleton",
      OR: [
        { tickLockHeldBy: null },
        { tickLockAt: { lt: staleBefore } },
      ],
    },
    data: { tickLockHeldBy: holder, tickLockAt: wallNow() },
  });

  return claimed.count === 1;
}

async function releaseLock(holder: string): Promise<void> {
  await db.systemState.updateMany({
    where: { id: "singleton", tickLockHeldBy: holder },
    data: { tickLockHeldBy: null, tickLockAt: null },
  });
}

/** Loads the active policy and shapes it into the engine's contract. */
async function loadActivePolicy(): Promise<Policy | null> {
  const row = await db.policyVersion.findFirst({
    where: { status: "ACTIVE" },
    include: { rules: { orderBy: { ordinal: "asc" } } },
    orderBy: { version: "desc" },
  });
  if (!row) return null;

  const rules: PolicyRule[] = row.rules.map((rule) => ({
    id: rule.id,
    ordinal: rule.ordinal,
    effect: rule.effect,
    scope:
      rule.scopeKind === "VENDOR"
        ? { kind: "VENDOR", vendorId: rule.scopeVendorId ?? "" }
        : rule.scopeKind === "CATEGORY"
          ? { kind: "CATEGORY", category: rule.scopeCategory ?? "" }
          : { kind: "ANY" },
    conditions: {
      ...(rule.maxAmountCents !== null
        ? { maxAmountCents: rule.maxAmountCents as never }
        : {}),
      ...(rule.minActiveSeatPct !== null
        ? { minActiveSeatPct: rule.minActiveSeatPct }
        : {}),
      ...(rule.frequency !== null ? { frequency: rule.frequency as Frequency } : {}),
      ...(rule.renewalWithinDays !== null
        ? { renewalWithinDays: rule.renewalWithinDays }
        : {}),
    },
    sourceFragment: rule.sourceFragment,
  }));

  return {
    id: row.id,
    version: row.version,
    englishText: row.englishText,
    rules,
    status: "ACTIVE",
    compiledAt: row.compiledAt.toISOString(),
    activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
  };
}

export async function runTick(): Promise<TickReport> {
  const state = await ensureSystemState();
  const clock = state.demoClock;
  const holder = randomUUID();
  const outcomes: Record<string, number> = {};
  let openTickId: string | null = null;

  if (!(await acquireLock(holder))) {
    // Another tick is already running. Exit silently — the next scheduled run
    // picks up anything missed.
    return {
      tickId: null,
      clockAt: clock.toISOString(),
      halted: true,
      haltReason: "LOCK_HELD",
      processed: 0,
      skipped: 0,
      outcomes,
    };
  }

  try {
    // Kill switch. Checked before anything else, and recorded rather than
    // silently obeyed — a halt must always be visible.
    if (state.killSwitchEngaged) {
      await db.tick.create({
        data: { clockAt: clock, status: "HALTED", haltReason: "KILL_SWITCH" },
      });
      return halted(clock, "KILL_SWITCH", outcomes);
    }

    // A failing adapter halts rather than guessing.
    if (!(await paymentBoundary().health())) {
      await db.tick.create({
        data: {
          clockAt: clock,
          status: "HALTED",
          haltReason: "ADAPTER_UNAVAILABLE",
        },
      });
      return halted(clock, "ADAPTER_UNAVAILABLE", outcomes);
    }

    // Refresh the mandate mirror before adjudicating anything. Prava owns
    // mandate truth; deciding against a stale local copy would mean proposing
    // charges against authority that has already been paused or spent.
    await refreshAllMandates();

    // Retire approvals past their window. Consent was to act on specific
    // evidence, and that evidence has aged out. The next tick may raise a fresh
    // request — a new decision, never a resurrected one.
    await expireStaleApprovals(clock);

    // Pinned once. A policy edit mid-tick cannot affect decisions in flight.
    const policy = await loadActivePolicy();
    if (!policy) {
      await db.tick.create({
        data: { clockAt: clock, status: "HALTED", haltReason: "NO_POLICY" },
      });
      return {
        tickId: null,
        clockAt: clock.toISOString(),
        halted: true,
        haltReason: "NO_POLICY",
        processed: 0,
        skipped: 0,
        outcomes,
      };
    }

    const tick = await db.tick.create({
      data: { clockAt: clock, policyVersionId: policy.id, status: "RUNNING" },
    });
    openTickId = tick.id;

    // Only the CURRENT cycle per vendor is a work item.
    //
    // Earlier cycles exist as rows because the evidence builder reads them as
    // price history — they are records, not renewals awaiting a decision.
    // Without this filter a tick adjudicates every historical cycle it can
    // reach, which floods the ledger with decisions about the past.
    const candidates = await db.renewal.findMany({
      where: { dueDate: { lte: addDays(clock, LOOKAHEAD_DAYS) } },
      orderBy: [{ vendorId: "asc" }, { cycleStart: "desc" }],
    });

    const seenVendors = new Set<string>();
    const due = candidates
      .filter((renewal) => {
        if (seenVendors.has(renewal.vendorId)) return false;
        seenVendors.add(renewal.vendorId);
        return true;
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    const agent = activeAgent();
    let processed = 0;
    let skipped = 0;

    for (const renewal of due) {
      // Idempotency on (renewal, cycle). Frequent ticks are harmless and a
      // button pressed twice on stage does nothing the second time. Nobody has
      // operator discipline while being watched.
      if (
        await hasEntryForCycle({
          renewalId: renewal.id,
          cycleStart: renewal.cycleStart,
        })
      ) {
        skipped += 1;
        continue;
      }

      const evidence = await buildEvidenceBundle({
        renewalId: renewal.id,
        clock,
      });
      if (!evidence) continue;

      const proposed = await agent.propose({
        evidence,
        policyText: policy.englishText,
      });

      if (!proposed.ok) {
        if (proposed.reason === "UNAVAILABLE") {
          // The model could not be reached. Halt the whole tick rather than
          // processing a partial set — and charge nothing.
          await db.tick.update({
            where: { id: tick.id },
            data: {
              status: "HALTED",
              haltReason: "AGENT_UNAVAILABLE",
              finishedAt: wallNow(),
            },
          });
          return halted(clock, "AGENT_UNAVAILABLE", outcomes, tick.id, processed);
        }

        // Malformed output becomes a visible refusal, never a silent skip, and
        // is never retried with a softer prompt. The agent failing to meet its
        // contract is the system working, and it belongs in the record.
        await appendEntry(
          {
            tickId: tick.id,
            clockAt: clock,
            vendorId: evidence.vendorId,
            vendorName: evidence.vendorName,
            renewalId: evidence.renewalId,
            cycleStart: renewal.cycleStart,
            proposedAction: "ESCALATE",
            proposedAmountCents: cents(0),
            decidedBy: {
              modelId: agent.modelId,
              promptVersion: agent.promptVersion,
              stubbed: agent.stubbed,
            },
            authorizedBy: null,
            evidence,
            alternative: null,
            agentRationale: null,
            counterfactualCents: evidence.renewal.amountCents,
          },
          {
            outcome: "REFUSED",
            refusalCode: "MALFORMED_PROPOSAL",
            chargedCents: cents(0),
            explanation: `Refused ${evidence.vendorName}. The agent's output did not meet the contract. Nothing was charged.`,
            counterfactual: `Do nothing and you pay ${evidence.renewal.amountCents} cents on ${evidence.renewal.dueDate}.`,
            error: { code: "MALFORMED_PROPOSAL", message: proposed.message },
          },
        );

        outcomes.REFUSED = (outcomes.REFUSED ?? 0) + 1;
        processed += 1;
        continue;
      }

      const result = await routeOutcome({
        tickId: tick.id,
        clock,
        proposal: proposed.proposal,
        evidence,
        policy,
        decidedBy: {
          modelId: agent.modelId,
          promptVersion: agent.promptVersion,
          stubbed: agent.stubbed,
        },
      });

      outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
      processed += 1;
    }

    await db.tick.update({
      where: { id: tick.id },
      data: { status: "COMPLETED", finishedAt: wallNow() },
    });

    return {
      tickId: tick.id,
      clockAt: clock.toISOString(),
      halted: false,
      processed,
      skipped,
      outcomes,
    };
  } catch (error) {
    // An unexpected throw must not leave a tick RUNNING forever. A row stuck in
    // that state looks, on the dashboard, exactly like a tick that is still
    // working — which is the worst thing it could look like.
    if (openTickId) {
      await db.tick
        .update({
          where: { id: openTickId },
          data: {
            status: "HALTED",
            haltReason: "ADAPTER_UNAVAILABLE",
            finishedAt: wallNow(),
          },
        })
        .catch(() => {
          /* the original error matters more than this bookkeeping */
        });
    }
    throw error;
  } finally {
    await releaseLock(holder);
  }
}
