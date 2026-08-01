import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { getClockState } from "../clock";
import { buildEvidenceBundle, selectDueRenewals } from "../evidence";
import { propose } from "../agent";
import { evaluate } from "../policy/engine";
import { route } from "../outcome";
import { NOBODY, TICK, appendEntry, hasEntryForCycle } from "../ledger";
import { getPravaAdapter } from "../prava";
import type { PolicyRule, Verdict } from "../contracts";

/**
 * The tick runner.
 *
 * One tick selects the renewals that are due, pins a policy version for the
 * whole run, and drives every renewal through the same pipeline: evidence,
 * proposal, verdict, outcome. It is the single scheduler entry point and the
 * only thing that closes the loop.
 *
 * Two properties matter more than the sequencing:
 *
 *   Single-flight. Exactly one tick runs at a time, enforced by a unique lock
 *   row rather than by an in-process flag — the application runs in more than
 *   one process, and a flag in one of them says nothing about the others.
 *
 *   The policy version is pinned once, at the top. A tick that re-read the
 *   active policy per renewal could adjudicate two renewals under two different
 *   policies in the same run, and no one reading the ledger afterwards would be
 *   able to tell.
 */

const LOCK_KEY = "tick";

export type HaltReason =
  | "KILL_SWITCH"
  | "NO_ACTIVE_POLICY"
  | "LOCK_CONTENTION"
  | "ADAPTER_UNHEALTHY"
  | "CLOCK_UNINITIALIZED"
  | "UNHANDLED_ERROR";

export interface TickResult {
  tickId: string | null;
  halted: boolean;
  haltReason: HaltReason | null;
  considered: number;
  written: number;
  duplicates: number;
  outcomes: Record<string, number>;
}

export async function runTick(): Promise<TickResult> {
  const empty: TickResult = {
    tickId: null,
    halted: true,
    haltReason: null,
    considered: 0,
    written: 0,
    duplicates: 0,
    outcomes: {},
  };

  // ---- clock ----
  let clock;
  try {
    clock = await getClockState();
  } catch {
    return { ...empty, haltReason: "CLOCK_UNINITIALIZED" };
  }

  // ---- lock ----
  let tickId: string;
  try {
    const run = await prisma.tickRun.create({
      data: { startedAt: clock.now, lockKey: LOCK_KEY },
      select: { id: true },
    });
    tickId = run.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Another tick holds the lock. Halting is the correct answer; queueing
      // behind it would mean two ticks adjudicating the same renewals.
      //
      // There is no tick row to attribute this to — this run never acquired
      // one — so the entry is written against the run that does hold the lock.
      const holder = await prisma.tickRun.findFirst({
        where: { lockKey: LOCK_KEY },
        select: { id: true },
      });
      await writeHaltEntry(
        holder ? holder.id : "tick_unacquired",
        "LOCK_CONTENTION",
        clock.now,
      );
      return { ...empty, haltReason: "LOCK_CONTENTION" };
    }
    throw error;
  }

  try {
    // ---- kill switch ----
    if (clock.killSwitchOn) {
      return await halt(tickId, "KILL_SWITCH", clock.now);
    }

    // ---- adapter health ----
    const adapter = getPravaAdapter();
    const health = await adapter.health();
    if (!health.healthy) {
      return await halt(tickId, "ADAPTER_UNHEALTHY", clock.now);
    }

    // ---- pin the policy version for the whole tick ----
    const policy = await prisma.policyVersion.findFirst({
      where: { status: "ACTIVE" },
      include: { rules: { orderBy: { ordinal: "asc" } } },
      orderBy: { version: "desc" },
    });

    if (!policy) {
      return await halt(tickId, "NO_ACTIVE_POLICY", clock.now);
    }

    const rules: PolicyRule[] = policy.rules.map((r) => ({
      id: r.id,
      ordinal: r.ordinal,
      effect: r.effect,
      conditions: parseConditions(r.conditions),
      amountCeiling: r.amountCeilingCents,
      currency: r.currency as PolicyRule["currency"],
      sourceFragment: r.sourceFragment,
      description: r.description,
    }));

    // ---- drive the pipeline ----
    const renewalIds = await selectDueRenewals(clock.now);
    const outcomes: Record<string, number> = {};
    let written = 0;
    let duplicates = 0;

    for (const renewalId of renewalIds) {
      const bundle = await buildEvidenceBundle({
        renewalId,
        observedAt: clock.now,
      });

      // Idempotency is checked here, before the agent is consulted and before
      // the adapter is touched. The unique constraint on (renewalId, cycleKey)
      // is the guarantee and this read is the optimization — a second tick
      // should not spend a model call and a network round trip to discover
      // that it has nothing to do. The stage button will be pressed twice.
      if (await hasEntryForCycle(renewalId, bundle.renewal.cycleKey)) {
        duplicates += 1;
        continue;
      }

      const proposalResult = await propose(bundle);
      const proposal = proposalResult.ok ? proposalResult.proposal : null;

      const verdict = evaluate({
        evidence: bundle,
        proposal,
        rules,
        policyVersionId: policy.id,
      }) as Verdict;

      const mandate = await prisma.mandate.findFirst({
        where: { vendorId: bundle.vendor.id, status: "ACTIVE" },
        orderBy: { pravaMandateId: "asc" },
        select: { pravaMandateId: true },
      });

      const result = await route({
        tickId,
        recordedAt: clock.now,
        bundle,
        proposal,
        verdict,
        mandateId: mandate ? mandate.pravaMandateId : null,
        adapter,
      });

      if (result.duplicate) {
        duplicates += 1;
      } else {
        written += 1;
        outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
      }
    }

    await prisma.tickRun.update({
      where: { id: tickId },
      data: { endedAt: clock.now, entriesWritten: written, lockKey: null },
    });

    return {
      tickId,
      halted: false,
      haltReason: null,
      considered: renewalIds.length,
      written,
      duplicates,
      outcomes,
    };
  } catch (error) {
    // Release the lock before rethrowing. A tick that dies holding the lock
    // makes every subsequent tick halt on contention, which turns one failure
    // into a permanently stopped system.
    await releaseLock(tickId);
    await writeHaltEntry(tickId, "UNHANDLED_ERROR", clock.now);
    throw error;
  }
}

/**
 * Conditions come out of a Json column, so their shape is not guaranteed by the
 * type system. A stored condition that is not an object is dropped rather than
 * coerced: a rule whose conditions cannot be read is a rule that does not match,
 * and a rule that does not match cannot grant permission.
 */
function parseConditions(raw: unknown): PolicyRule["conditions"] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is PolicyRule["conditions"][number] =>
      typeof c === "object" &&
      c !== null &&
      typeof (c as { field?: unknown }).field === "string" &&
      typeof (c as { operator?: unknown }).operator === "string",
  );
}

/**
 * What each halt means, in the words the product uses to explain itself. A halt
 * that only appears in a log is a halt nobody sees; these strings are what the
 * ledger and the halted chrome render.
 */
const HALT_MESSAGES: Record<HaltReason, string> = {
  KILL_SWITCH:
    "The kill switch is engaged. No renewal was adjudicated and nothing was charged.",
  NO_ACTIVE_POLICY:
    "No policy version is active. Without a policy there is no authority to act under, so nothing was adjudicated.",
  LOCK_CONTENTION:
    "Another tick is already running. This one stopped rather than adjudicating the same renewals twice.",
  ADAPTER_UNHEALTHY:
    "The payment network is unreachable. Nothing was adjudicated and nothing was charged.",
  CLOCK_UNINITIALIZED:
    "The demo clock is not initialized. The system will not act without a known time.",
  UNHANDLED_ERROR:
    "The tick stopped on an unexpected error. Nothing further was adjudicated.",
};

/**
 * Halting writes a ledger entry.
 *
 * A halt is a thing that happened and it belongs in the record alongside
 * everything else. Writing it here rather than only to the tick row is what
 * makes "the system stopped" visible on the surface people actually read — a
 * silent halt is indistinguishable from a system that had nothing to do.
 */
async function halt(
  tickId: string,
  reason: HaltReason,
  recordedAt?: Date,
): Promise<TickResult> {
  await prisma.tickRun.update({
    where: { id: tickId },
    data: { halted: true, haltReason: reason, lockKey: null },
  });

  if (recordedAt) {
    await writeHaltEntry(tickId, reason, recordedAt);
  }

  return {
    tickId,
    halted: true,
    haltReason: reason,
    considered: 0,
    written: 0,
    duplicates: 0,
    outcomes: {},
  };
}

async function writeHaltEntry(
  tickId: string,
  reason: HaltReason,
  recordedAt: Date,
): Promise<void> {
  try {
    await appendEntry({
      recordedAt,
      tickId,
      vendorId: "system",
      renewalId: null,
      cycleKey: null,
      outcome: "HALTED",
      amount: null,
      // Nobody decided and nobody authorized, because nothing was adjudicated.
      // Saying so explicitly is more honest than attributing the halt to the
      // agent or the engine, neither of which was consulted.
      decidedBy: NOBODY,
      authorizedBy: NOBODY,
      executedBy: NOBODY,
      recordedBy: TICK,
      detail: { haltReason: reason, message: HALT_MESSAGES[reason] },
    });
  } catch {
    // The tick row already records the halt. Failing to also write the ledger
    // entry must not turn a halt into a crash.
  }
}

export { HALT_MESSAGES };

async function releaseLock(tickId: string): Promise<void> {
  try {
    await prisma.tickRun.update({
      where: { id: tickId },
      // Only the lock is released. `endedAt` stays null, which is what marks
      // this run as one that failed rather than one that finished.
      data: { lockKey: null, halted: true, haltReason: "UNHANDLED_ERROR" },
    });
  } catch {
    // Releasing the lock is best-effort. If it fails the original error is the
    // one worth surfacing.
  }
}
