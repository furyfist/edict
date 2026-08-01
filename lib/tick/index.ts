import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import { getClockState } from "../clock";
import { buildEvidenceBundle, selectDueRenewals } from "../evidence";
import { propose } from "../agent";
import { evaluate } from "../policy/engine";
import { route } from "../outcome";
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
  | "CLOCK_UNINITIALIZED";

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
      return { ...empty, haltReason: "LOCK_CONTENTION" };
    }
    throw error;
  }

  try {
    // ---- kill switch ----
    if (clock.killSwitchOn) {
      return await halt(tickId, "KILL_SWITCH");
    }

    // ---- adapter health ----
    const adapter = getPravaAdapter();
    const health = await adapter.health();
    if (!health.healthy) {
      return await halt(tickId, "ADAPTER_UNHEALTHY");
    }

    // ---- pin the policy version for the whole tick ----
    const policy = await prisma.policyVersion.findFirst({
      where: { status: "ACTIVE" },
      include: { rules: { orderBy: { ordinal: "asc" } } },
      orderBy: { version: "desc" },
    });

    if (!policy) {
      return await halt(tickId, "NO_ACTIVE_POLICY");
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

async function halt(
  tickId: string,
  reason: HaltReason,
): Promise<TickResult> {
  await prisma.tickRun.update({
    where: { id: tickId },
    data: { halted: true, haltReason: reason, lockKey: null },
  });
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
