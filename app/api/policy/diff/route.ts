import { NextResponse } from "next/server";
import { currentBundles } from "@/lib/policy/preview";
import { policyById } from "@/lib/policy/versions";
import { buildBattery, diffReplays, replay } from "@/lib/simulate";

export const dynamic = "force-dynamic";

/**
 * Behavioral diff between two policy versions.
 *
 * On demand rather than on page load: the answer costs a set of evidence reads,
 * and the policy page is one of the pages that has to stay fast. Nobody needs
 * this until they ask for it, and when they ask, they are asking deliberately.
 *
 * Both versions are replayed over ONE battery built once, which is what makes
 * the comparison meaningful — see lib/simulate/diff.ts.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to policy version ids are required" },
      { status: 400 },
    );
  }

  const [beforePolicy, afterPolicy] = await Promise.all([
    policyById(from),
    policyById(to),
  ]);

  if (!beforePolicy || !afterPolicy) {
    return NextResponse.json({ error: "unknown policy version" }, { status: 404 });
  }

  const battery = buildBattery(await currentBundles());

  return NextResponse.json({
    ok: true,
    diff: diffReplays(
      battery,
      replay({ scenarios: battery.scenarios, policy: beforePolicy }),
      replay({ scenarios: battery.scenarios, policy: afterPolicy }),
    ),
  });
}
