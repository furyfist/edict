import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { now } from "@/lib/clock";
import { compilePolicy } from "@/lib/policy/compiler";
import { findUnboundedRules } from "@/lib/policy/compiler/bounded";

export const dynamic = "force-dynamic";

/**
 * Compile English into a draft policy version.
 *
 * The version this creates is `DRAFT`, and a draft has no force. Nothing in
 * the tick path reads a draft; `runTick` selects `status: "ACTIVE"` only. That
 * is the inert-draft gate, and it is what keeps the model out of the
 * authorization path even though the model is what read the English.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let sourceText: string;
  try {
    const body = (await request.json()) as { sourceText?: unknown };
    if (typeof body.sourceText !== "string") {
      return NextResponse.json(
        { error: "sourceText must be a string" },
        { status: 400 },
      );
    }
    sourceText = body.sourceText;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const result = await compilePolicy(sourceText);

  if (!result.ok) {
    // A rejection names the clause and shows what was understood. The user
    // sees exactly which sentence did not compile rather than a policy that
    // silently enforces less than they wrote.
    return NextResponse.json(
      {
        ok: false,
        rejections: result.rejections,
        understood: result.understood,
        sourceText: result.sourceText,
      },
      { status: 422 },
    );
  }

  // Belt and braces: the compiler already refuses unbounded auto-approval, and
  // this checks again at the point of persistence. Two independent checks on
  // the property that unattended spending always has a ceiling.
  const unbounded = findUnboundedRules(result.rules);
  if (unbounded.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        rejections: unbounded.map((rule) => ({
          clause: rule.sourceFragment,
          reason:
            "This would permit unattended spending with no upper limit. Add an amount ceiling and compile again.",
        })),
        understood: result.rules.filter((r) => !unbounded.includes(r)),
        sourceText,
      },
      { status: 422 },
    );
  }

  const instant = await now();
  const highest = await prisma.policyVersion.findFirst({
    orderBy: { version: "desc" },
    select: { version: true },
  });

  const draft = await prisma.policyVersion.create({
    data: {
      version: (highest?.version ?? 0) + 1,
      sourceText,
      status: "DRAFT",
      createdAt: instant,
      rules: {
        create: result.rules.map((rule) => ({
          ordinal: rule.ordinal,
          effect: rule.effect,
          conditions: rule.conditions as never,
          amountCeilingCents: rule.amountCeiling,
          currency: rule.currency,
          sourceFragment: rule.sourceFragment,
          description: rule.description,
        })),
      },
    },
    include: { rules: { orderBy: { ordinal: "asc" } } },
  });

  return NextResponse.json({
    ok: true,
    // Explicit, because it is the point: this version does nothing yet.
    status: draft.status,
    note: "This draft has no effect until a human confirms it.",
    policyVersionId: draft.id,
    version: draft.version,
    rules: draft.rules,
  });
}
