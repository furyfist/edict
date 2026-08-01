import { NextResponse } from "next/server";
import { resetDatabase, seedDatabase } from "@/lib/db/seed";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Restore a clean state.
 *
 * Between rehearsal runs — and if a live demo goes sideways — this puts the
 * whole system back to a known starting point in seconds, without anyone
 * opening a terminal in front of an audience.
 *
 * Deliberately destructive and deliberately unguarded beyond the demo token:
 * this environment exists to be reset.
 */
export async function POST(request: Request) {
  const expected = process.env.DEMO_ADMIN_TOKEN;
  if (expected) {
    const provided =
      request.headers.get("x-demo-token") ??
      new URL(request.url).searchParams.get("token");
    if (provided !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    await resetDatabase();
    const counts = await seedDatabase();
    return NextResponse.json({ ok: true, counts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
