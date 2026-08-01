import { NextResponse } from "next/server";
import { advance, getClockState } from "@/lib/clock";

export const dynamic = "force-dynamic";

/**
 * Advance the demo clock.
 *
 * The clock only moves forward. Moving it backwards would let a tick re-run
 * against evidence it has already adjudicated, and there is no demo reason to
 * allow it — every scenario the demo needs is reachable by moving forward.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let hours = 24;

  try {
    const body = (await request.json()) as { hours?: unknown };
    if (body.hours !== undefined) {
      if (!Number.isInteger(body.hours) || (body.hours as number) <= 0) {
        return NextResponse.json(
          { error: "hours must be a positive whole number" },
          { status: 400 },
        );
      }
      hours = body.hours as number;
    }
  } catch {
    // An empty body is fine and means the default.
  }

  try {
    const next = await advance(hours);
    const state = await getClockState();
    return NextResponse.json({
      ok: true,
      now: next.toISOString(),
      killSwitchOn: state.killSwitchOn,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 409 },
    );
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const state = await getClockState();
    return NextResponse.json({
      now: state.now.toISOString(),
      killSwitchOn: state.killSwitchOn,
    });
  } catch {
    return NextResponse.json(
      { error: "The demo clock is not initialized. Run the seed." },
      { status: 409 },
    );
  }
}
