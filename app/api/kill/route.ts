import { NextResponse } from "next/server";
import { getClockState, now, setKillSwitch } from "@/lib/clock";
import { NOBODY, TICK, appendEntry, human } from "@/lib/ledger";
import { pauseAllMandates } from "@/lib/prava/mandates";

export const dynamic = "force-dynamic";

/**
 * The kill switch.
 *
 * Two effects, in this order, and the order is the design:
 *
 *   1. Pause every active mandate at the network. This is what actually stops
 *      money. It happens first because it is the part that does not depend on
 *      our code continuing to run correctly — once a mandate is paused at
 *      Prava, a charge is declined there, whatever this application does next.
 *
 *   2. Set the local halt flag, so the next tick stops before adjudicating.
 *      This is the tidy part, and it is second because it is the weaker
 *      guarantee: a flag in our database only works if our code reads it.
 *
 * An operator reaching for this is having a bad day and does not want to learn
 * about our failure modes. So a partial failure is reported honestly and
 * loudly — if three mandates paused and one did not, the response says which
 * one, because "mostly stopped" is not a state anyone can act on without
 * knowing the remainder.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let engagedBy: string;
  let engage = true;

  try {
    const body = (await request.json()) as {
      engagedBy?: unknown;
      engage?: unknown;
    };
    if (typeof body.engagedBy !== "string" || !body.engagedBy.trim()) {
      return NextResponse.json(
        { error: "engagedBy is required — this action is always attributed" },
        { status: 400 },
      );
    }
    engagedBy = body.engagedBy.trim();
    if (typeof body.engage === "boolean") engage = body.engage;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const instant = await now();
  const operator = human(engagedBy, engagedBy);

  if (!engage) {
    // Releasing the halt does not resume mandates. Resuming payment authority
    // is a separate, deliberate act per mandate — a single button that both
    // restarts the system and re-arms every credential is the wrong shape for
    // the moment after an incident.
    await setKillSwitch(false);
    await appendEntry({
      recordedAt: instant,
      tickId: `kill_release_${instant.toISOString()}`,
      vendorId: "system",
      renewalId: null,
      cycleKey: null,
      outcome: "HALTED",
      amount: null,
      decidedBy: operator,
      authorizedBy: operator,
      executedBy: NOBODY,
      recordedBy: TICK,
      detail: {
        killSwitch: "RELEASED",
        note: "Ticks may run again. Paused mandates were not resumed — resume each one deliberately.",
      },
    });

    return NextResponse.json({
      ok: true,
      killSwitchOn: false,
      note: "Ticks may run again. Mandates remain paused until resumed individually.",
    });
  }

  // Money first.
  const { paused, failed } = await pauseAllMandates();

  // Then the halt flag.
  await setKillSwitch(true);

  await appendEntry({
    recordedAt: instant,
    tickId: `kill_${instant.toISOString()}`,
    vendorId: "system",
    renewalId: null,
    cycleKey: null,
    outcome: "HALTED",
    amount: null,
    decidedBy: operator,
    authorizedBy: operator,
    executedBy: NOBODY,
    recordedBy: TICK,
    detail: {
      killSwitch: "ENGAGED",
      mandatesPaused: paused,
      mandatesFailed: failed,
      note:
        failed.length === 0
          ? "Every active mandate is paused and the next tick will halt."
          : `${paused.length} mandates paused; ${failed.length} could not be reached and may still authorize charges.`,
    },
  });

  const state = await getClockState();

  return NextResponse.json(
    {
      ok: failed.length === 0,
      killSwitchOn: state.killSwitchOn,
      mandatesPaused: paused,
      mandatesFailed: failed,
      note:
        failed.length === 0
          ? "Every active mandate is paused. The next tick will halt."
          : "Some mandates could not be paused. They may still authorize charges — pause them directly in Prava.",
    },
    // A partial failure is not a 200. An operator scripting against this must
    // be able to tell the difference without reading the body.
    { status: failed.length === 0 ? 200 : 502 },
  );
}

/** Current halt state, for the global halted chrome. */
export async function GET(): Promise<NextResponse> {
  try {
    const state = await getClockState();
    return NextResponse.json({ killSwitchOn: state.killSwitchOn });
  } catch {
    return NextResponse.json({ killSwitchOn: false, error: "clock uninitialized" });
  }
}
