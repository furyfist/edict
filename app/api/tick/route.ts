import { NextResponse } from "next/server";
import { runTick } from "./runner";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The single scheduler entry point.
 *
 * The cron calls this. The stage button calls this. The year speed-run calls
 * this in a loop. There is no demo-only path, because a demo-only path is a
 * demo-only bug — and it would make the unattended-autonomy claim false.
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
    const report = await runTick();
    return NextResponse.json(report);
  } catch (error) {
    // A tick that throws must still be visible. Never fail silently — and do
    // not claim a specific halt reason we have not established. The runner has
    // already marked the tick row HALTED; this reports the truth to the caller.
    return NextResponse.json(
      {
        halted: true,
        haltReason: "UNEXPECTED_ERROR",
        processed: 0,
        skipped: 0,
        outcomes: {},
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
