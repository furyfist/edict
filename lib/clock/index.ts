import { db } from "../db/client";

/**
 * The demo clock.
 *
 * System time is a database value, not wall time. Every component that reasons
 * about dates — renewal proximity, seat inactivity, approval expiry — reads it
 * from here.
 *
 * This is deliberate and it is load-bearing:
 *
 *   - the unattended overnight run is reproducible
 *   - the year speed-run is free rather than a special code path
 *   - a tick executed at 3am and a tick executed on stage behave identically
 *
 * RULE: no component may call `Date.now()` or `new Date()` for domain logic.
 * Wall clock is permitted only for operational timestamps — `createdAt`,
 * log lines, lock timers — and those go through `wallNow()` so the intent is
 * visible at the call site.
 */

/** The instant the demo begins. Matches the fixture bundles. */
export const DEFAULT_DEMO_CLOCK = new Date("2026-03-01T09:00:00.000Z");

const SINGLETON_ID = "singleton";

/** Creates the singleton row if it does not exist. Safe to call repeatedly. */
export async function ensureSystemState() {
  return db.systemState.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID, demoClock: DEFAULT_DEMO_CLOCK },
  });
}

/** The time the system believes it is. */
export async function getClock(): Promise<Date> {
  const state = await ensureSystemState();
  return state.demoClock;
}

/** Moves the clock to an absolute instant. */
export async function setClock(at: Date): Promise<Date> {
  await ensureSystemState();
  const state = await db.systemState.update({
    where: { id: SINGLETON_ID },
    data: { demoClock: at },
  });
  return state.demoClock;
}

/** Moves the clock forward by whole days. Negative values move it back. */
export async function advanceDays(days: number): Promise<Date> {
  const current = await getClock();
  const next = new Date(current);
  next.setUTCDate(next.getUTCDate() + days);
  return setClock(next);
}

/**
 * Wall clock. Operational timestamps only — never domain logic.
 *
 * Named so that any use of real time is obvious in review.
 */
export function wallNow(): Date {
  return new Date();
}

// ---------------------------------------------------------------------------
// Date helpers — all relative to a clock value passed in, never to wall time
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days from `from` to `to`. Negative when `to` is in the past. */
export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function startOfDay(at: Date): Date {
  const d = new Date(at);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export function addDays(at: Date, days: number): Date {
  const d = new Date(at);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** ISO date only, e.g. "2026-03-01". Used for cycle keys and display. */
export function isoDate(at: Date): string {
  return startOfDay(at).toISOString().slice(0, 10);
}
