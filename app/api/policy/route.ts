import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { compilePolicy } from "@/lib/policy/compiler";
import { listVersions, saveDraft } from "@/lib/policy/versions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Compile English into rules.
 *
 * This endpoint NEVER activates anything. It returns an inert draft, or a
 * rejection that names the offending clause and shows what was understood.
 * Activation is a separate, explicitly human action — see ./activate.
 */
export async function POST(request: Request) {
  let body: { englishText?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.englishText !== "string") {
    return NextResponse.json(
      { error: "englishText must be a string" },
      { status: 400 },
    );
  }

  const vendors = await db.vendor.findMany({
    select: { id: true, name: true, category: true },
  });

  const result = await compilePolicy({
    englishText: body.englishText,
    vendors,
  });

  if (!result.ok) {
    // 422, not 500. A policy that cannot be compiled is a normal outcome to be
    // shown to the user, not a system failure to be hidden.
    return NextResponse.json(
      {
        ok: false,
        errors: result.errors,
        understood: result.understood,
        unsupportedClauses: result.unsupportedClauses,
      },
      { status: 422 },
    );
  }

  const policyVersionId = await saveDraft(result.draft);

  return NextResponse.json({
    ok: true,
    policyVersionId,
    status: "DRAFT",
    draft: result.draft,
    note: "This policy is inert. It governs nothing until it is activated.",
  });
}

export async function GET() {
  return NextResponse.json({ versions: await listVersions() });
}
