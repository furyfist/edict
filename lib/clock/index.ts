import { prisma } from "../db/client";

/**
 * The demo clock.
 *
 * System time is a database value. It is read explicitly and advanced
 * explicitly, and no other component in the codebase calls `new Date()` or
 * `Date.now()` to learn what time it is.
 *
 * This is built before any consumer exists. Retrofitting a clock into finished
 * components means auditing every time access in the codebase; building it
 * first means the wrong thing was never written.
 *
 * The one permitted use of wall time is `seedClock`, which needs a starting
 * value the first time a database is initialized. After that, the clock only
 * ever moves because something asked it to.
 */

const SINGLETON = "singleton";

/** The instant a fresh database starts at. Fixed, so seeds are reproducible. */
export const DEMO_EPOCH = new Date("2025-03-01T09:00:00.000Z");

export interface ClockState {
  now: Date;
  killSwitchOn: boolean;
}

async function readState(): Promise<ClockState> {
  const row = await prisma.systemState.findUnique({ where: { id: SINGLETON } });
  if (!row) {
    throw new Error(
      "Demo clock has not been initialized. Run the seed before reading time.",
    );
  }
  return { now: row.now, killSwitchOn: row.killSwitchOn };
}

/** The current demo instant. Every timestamp in the system comes from here. */
export async function now(): Promise<Date> {
  return (await readState()).now;
}

/** ISO form, which is what the contracts carry. */
export async function nowIso(): Promise<string> {
  return (await now()).toISOString();
}

export async function getClockState(): Promise<ClockState> {
  return readState();
}

/**
 * Advance the clock by a whole number of hours. The clock only moves forward —
 * moving it backwards would let a tick re-run against evidence it has already
 * adjudicated, and there is no demo reason to allow it.
 */
export async function advance(hours: number): Promise<Date> {
  if (!Number.isInteger(hours) || hours <= 0) {
    throw new Error("The demo clock advances by whole positive hours only.");
  }
  const current = await now();
  const next = new Date(current.getTime() + hours * 3_600_000);
  const row = await prisma.systemState.update({
    where: { id: SINGLETON },
    data: { now: next },
  });
  return row.now;
}

/** Set the clock to an explicit instant. Used by the seed and the reseed path. */
export async function setNow(instant: Date): Promise<Date> {
  const row = await prisma.systemState.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON, now: instant },
    update: { now: instant },
  });
  return row.now;
}

/** Initialize the clock at the fixed epoch. Called by the seed. */
export async function seedClock(): Promise<Date> {
  return setNow(DEMO_EPOCH);
}

export async function isKillSwitchOn(): Promise<boolean> {
  return (await readState()).killSwitchOn;
}

export async function setKillSwitch(on: boolean): Promise<void> {
  await prisma.systemState.update({
    where: { id: SINGLETON },
    data: { killSwitchOn: on },
  });
}

/** Add hours to an instant without touching the clock. Pure. */
export function plusHours(instant: Date, hours: number): Date {
  return new Date(instant.getTime() + hours * 3_600_000);
}

/** Add days to an instant without touching the clock. Pure. */
export function plusDays(instant: Date, days: number): Date {
  return plusHours(instant, days * 24);
}
