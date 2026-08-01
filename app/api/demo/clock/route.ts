import { NextResponse } from "next/server";
import { advanceDays, getClock, setClock } from "@/lib/clock";

export const dynamic = "force-dynamic";

/**
 * Move the demo clock.
 *
 * System time is a database value, which is what makes the overnight run
 * reproducible and the year speed-run free rather than a special code path.
 * Advancing time here is the same as advancing it any other way — the tick
 * reads the clock, not the wall.
 */
export async function GET() {
  return NextResponse.json({ clock: (await getClock()).toISOString() });
}

export async function POST(request: Request) {
  let body: { days?: unknown; at?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (typeof body.at === "string") {
    const parsed = new Date(body.at);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ error: "at is not a date" }, { status: 400 });
    }
    return NextResponse.json({ clock: (await setClock(parsed)).toISOString() });
  }

  if (typeof body.days === "number" && Number.isInteger(body.days)) {
    return NextResponse.json({
      clock: (await advanceDays(body.days)).toISOString(),
    });
  }

  return NextResponse.json(
    { error: "provide days (integer) or at (ISO date)" },
    { status: 400 },
  );
}
