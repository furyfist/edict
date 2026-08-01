import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { compilePolicy } from "@/lib/policy/compiler";
import { previewVersion } from "@/lib/policy/preview";
import { listVersions, saveDraft } from "@/lib/policy/versions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Compile English into rules — and rehearse them.
 *
 * This endpoint NEVER activates anything. It returns an inert draft, or a
 * rejection that names the offending clause and shows what was understood.
 * Activation is a separate, explicitly human action — see ./activate.
 *
 * The preview is computed HERE, in the same round trip, because it is part of
 * what the confirmation modal has to show. A draft that arrives without its
 * preview is a draft someone can confirm without one.
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

  // The draft is persisted first so the preview cites the rule ids the policy
  // will actually run under. Previewing the in-memory draft would produce
  // citations that exist nowhere, and the modal links each row to its rule.
  //
  // A preview failure must not cost the user their compile: the draft is saved,
  // valid, and inert either way. The modal renders the absence rather than
  // pretending the policy has no consequences.
  let preview = null;
  let previewDigest: string | null = null;
  try {
    const computed = await previewVersion(policyVersionId);
    preview = computed?.preview ?? null;
    previewDigest = computed?.digest ?? null;
  } catch (error) {
    console.error("[policy] preview failed; draft stands without one:", error);
  }

  return NextResponse.json({
    ok: true,
    policyVersionId,
    status: "DRAFT",
    draft: result.draft,
    preview,
    previewDigest,
    note: "This policy is inert. It governs nothing until it is activated.",
  });
}

export async function GET() {
  return NextResponse.json({ versions: await listVersions() });
}
