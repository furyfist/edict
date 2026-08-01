import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { now } from "@/lib/clock";
import { findUnboundedRules } from "@/lib/policy/compiler/bounded";
import type { PolicyRule } from "@/lib/contracts";

export const dynamic = "force-dynamic";

/**
 * Activate a draft policy version.
 *
 * This is the only path in the system that grants a policy force, and it is
 * driven by a human pressing a button. No model can reach it: the compiler
 * produces drafts and stops, and nothing else writes `status: "ACTIVE"`.
 *
 * Versions are immutable. Activating one supersedes the previous rather than
 * editing it, so the ledger's `policyVersionId` on a past entry always resolves
 * to the exact rules that were in force when the decision was made.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let policyVersionId: string;
  let confirmedBy: string;

  try {
    const body = (await request.json()) as {
      policyVersionId?: unknown;
      confirmedBy?: unknown;
    };
    if (typeof body.policyVersionId !== "string") {
      return NextResponse.json(
        { error: "policyVersionId must be a string" },
        { status: 400 },
      );
    }
    // Activation is attributed to a person. An unattributed activation would
    // leave a ledger entry whose authority chain ends in nobody.
    if (typeof body.confirmedBy !== "string" || !body.confirmedBy.trim()) {
      return NextResponse.json(
        { error: "confirmedBy is required — activation is always attributed" },
        { status: 400 },
      );
    }
    policyVersionId = body.policyVersionId;
    confirmedBy = body.confirmedBy.trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const draft = await prisma.policyVersion.findUnique({
    where: { id: policyVersionId },
    include: { rules: true },
  });

  if (!draft) {
    return NextResponse.json({ error: "no such policy version" }, { status: 404 });
  }

  if (draft.status !== "DRAFT") {
    return NextResponse.json(
      {
        error: `This version is ${draft.status.toLowerCase()}, not a draft. Versions are immutable; compile a new one instead.`,
      },
      { status: 409 },
    );
  }

  // The last gate before authority is granted. A rule that reached the
  // database unbounded — hand-edited, migrated, or restored from a backup —
  // does not become enforceable here.
  const asRules: PolicyRule[] = draft.rules.map((r) => ({
    id: r.id,
    ordinal: r.ordinal,
    effect: r.effect,
    conditions: [],
    amountCeiling: r.amountCeilingCents,
    currency: r.currency as PolicyRule["currency"],
    sourceFragment: r.sourceFragment,
    description: r.description,
  }));

  const unbounded = findUnboundedRules(asRules);
  if (unbounded.length > 0) {
    return NextResponse.json(
      {
        error: "This version contains unattended spending with no upper limit.",
        clauses: unbounded.map((r) => r.sourceFragment),
      },
      { status: 422 },
    );
  }

  const instant = await now();

  // Supersede then activate, in one transaction. A window in which two
  // versions are ACTIVE is a window in which a tick could pin either one.
  const [, activated] = await prisma.$transaction([
    prisma.policyVersion.updateMany({
      where: { status: "ACTIVE" },
      data: { status: "SUPERSEDED" },
    }),
    prisma.policyVersion.update({
      where: { id: policyVersionId },
      data: {
        status: "ACTIVE",
        activatedAt: instant,
        activatedBy: confirmedBy,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    policyVersionId: activated.id,
    version: activated.version,
    status: activated.status,
    activatedBy: activated.activatedBy,
    activatedAt: activated.activatedAt,
  });
}
