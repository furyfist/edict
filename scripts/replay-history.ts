/**
 * HISTORY REPLAY — determinism, as something you can run.
 *
 *   npm run replay
 *
 * Re-adjudicates every ledger entry from its own frozen evidence and the exact
 * policy version it ran under, then compares the re-derived verdict against the
 * one the entry recorded.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS PROVES, AND WHAT IT DOES NOT
 *
 * PROVES: the engine is a pure function of (evidence, proposal, policy). Every
 * decision in the record reproduces exactly, months later, on a different
 * machine, with no network and no model. If the engine ever acquires a hidden
 * input — a clock, a cache, an environment variable — this goes red.
 *
 * DOES NOT PROVE: that the evidence was true when it was frozen. Nothing
 * replayed from a snapshot can establish that, and the cross-check for it is the
 * Prava dashboard. Said here rather than left to be discovered.
 *
 * ---------------------------------------------------------------------------
 * WHY OUTCOMES ARE NOT ALWAYS COMPARED
 *
 * A verdict is the engine's business and is deterministic. An OUTCOME is not:
 * an ALLOW_AUTO verdict becomes EXECUTED or FAILED depending on what the card
 * network said, and re-running the engine cannot know that. So DENY and
 * REQUIRE_APPROVAL verdicts are checked against their recorded outcomes, and
 * ALLOW_AUTO is checked as far as the engine's own agreement and no further.
 * Claiming more than that would be the kind of overreach this whole repository
 * is written against.
 * ---------------------------------------------------------------------------
 *
 * Exit code 0 when every verdict reproduces, 1 otherwise.
 */

import { db } from "../lib/db/client";
import { evaluate } from "../lib/policy/engine";
import { toPolicy } from "../lib/policy/versions";
import { verifiedChain } from "../lib/ledger";
import type { Policy, Proposal } from "../lib/contracts";

const policyCache = new Map<string, Policy | null>();

async function policyFor(id: string): Promise<Policy | null> {
  if (!policyCache.has(id)) {
    const row = await db.policyVersion.findUnique({
      where: { id },
      include: { rules: { orderBy: { ordinal: "asc" } } },
    });
    policyCache.set(id, row ? toPolicy(row) : null);
  }
  return policyCache.get(id) ?? null;
}

/**
 * The proposal, reconstructed from the entry.
 *
 * Every field the engine reads — action, amount, currency — is stored verbatim.
 * `rationale` and `alternative` are stored too and restored for completeness,
 * though the engine reads neither: the model's prose has never been an input to
 * a decision, and this is one more place that stays true.
 */
function proposalOf(entry: Awaited<ReturnType<typeof verifiedChain>>[number]["entry"]): Proposal {
  return {
    vendorId: entry.vendorId,
    renewalId: entry.renewalId,
    action: entry.proposedAction,
    amountCents: entry.proposedAmountCents,
    currency: entry.currency,
    rationale: entry.agentRationale ?? "",
    alternative: entry.alternative ?? { action: "ESCALATE", reason: "" },
  };
}

const EXPECTED_OUTCOME: Record<string, string> = {
  DENY: "REFUSED",
  REQUIRE_APPROVAL: "ESCALATED",
};

async function main() {
  const chain = await verifiedChain();

  let checked = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const { entry } of chain) {
    // No authorizedBy means the engine never ran — the agent's output failed its
    // contract and was refused before adjudication. There is no verdict to
    // reproduce, and pretending otherwise would inflate the number below.
    if (!entry.authorizedBy) {
      skipped += 1;
      continue;
    }

    const policy = await policyFor(entry.authorizedBy.policyVersionId);
    if (!policy) {
      failures.push(
        `${entry.id} (${entry.vendorName}): policy version ` +
          `${entry.authorizedBy.policyVersionId} no longer exists`,
      );
      continue;
    }

    const verdict = evaluate({
      proposal: proposalOf(entry),
      evidence: entry.evidence,
      policy,
    });

    checked += 1;

    if (
      verdict.matchedRuleId !== entry.authorizedBy.ruleId ||
      verdict.matchedRuleOrdinal !== entry.authorizedBy.ruleOrdinal
    ) {
      failures.push(
        `${entry.id} (${entry.vendorName}): recorded rule ` +
          `${entry.authorizedBy.ruleOrdinal}/${entry.authorizedBy.ruleId}, ` +
          `replay says ${verdict.matchedRuleOrdinal}/${verdict.matchedRuleId}`,
      );
      continue;
    }

    const expected = EXPECTED_OUTCOME[verdict.effect];
    if (expected && entry.outcome !== expected && entry.outcome !== "HALTED") {
      failures.push(
        `${entry.id} (${entry.vendorName}): verdict ${verdict.effect} implies ` +
          `${expected}, entry records ${entry.outcome}`,
      );
    }
  }

  console.log(`entries in chain      ${chain.length}`);
  console.log(`verdicts re-derived   ${checked}`);
  console.log(`skipped (no verdict)  ${skipped}`);

  if (failures.length > 0) {
    console.log("");
    console.log(`REPLAY DIVERGED — ${failures.length} entr${failures.length === 1 ? "y" : "ies"}`);
    for (const failure of failures) console.log(`  ${failure}`);
    console.log("");
    console.log(
      "The engine did not reproduce a decision it made before. Either the engine " +
        "acquired a hidden input, or a policy version changed under an entry that " +
        "cites it. Both are serious.",
    );
    process.exitCode = 1;
    return;
  }

  console.log("");
  console.log(
    checked === 0
      ? "Nothing to replay — no entry in this ledger recorded a verdict."
      : `IDENTICAL — every recorded decision reproduced from its frozen evidence.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
