import { NextResponse } from "next/server";
import { runTick } from "@/lib/tick";

export const dynamic = "force-dynamic";

/**
 * The single scheduler entry point.
 *
 * The cron calls this, and so does the attack console. That they run the
 * identical code path is what makes the demo honest — the button on stage is
 * not a special case that behaves differently from the unattended schedule.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.TICK_SECRET;
  if (secret) {
    const provided =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const result = await runTick();
    return NextResponse.json(result, { status: result.halted ? 409 : 200 });
  } catch (error) {
    return NextResponse.json(
      {
        halted: true,
        haltReason: "UNHANDLED_ERROR",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

/** Vercel cron issues GET. Same path, same behavior. */
export async function GET(request: Request): Promise<NextResponse> {
  return POST(request);
}
