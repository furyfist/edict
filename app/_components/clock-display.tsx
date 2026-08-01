import { getClock } from "@/lib/clock";

/**
 * The demo clock, always visible.
 *
 * The audience must never wonder what day the system thinks it is — every
 * renewal decision is relative to this value, not to wall time.
 *
 * Falls back to a dash when the database is unreachable so the shell still
 * renders before a DATABASE_URL exists.
 */
export async function ClockDisplay() {
  let label = "—";

  try {
    const clock = await getClock();
    label = clock.toISOString().replace("T", " ").slice(0, 16) + "Z";
  } catch {
    label = "— no database —";
  }

  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-neutral-500">demo clock</span>
      <span className="font-mono text-neutral-300">{label}</span>
    </div>
  );
}
