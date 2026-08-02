import { Clock } from "lucide-react";
import { getClock } from "@/lib/clock";

/**
 * The demo clock, always visible.
 *
 * The audience must never wonder what day the system thinks it is — every
 * renewal decision is relative to this value, not to wall time.
 *
 * Falls back to an em-dash when the database is unreachable, so the shell still
 * renders before a DATABASE_URL exists. It never falls back to real time: a
 * silent substitution would make every "expires in" figure on the Authority
 * page quietly wrong.
 */
export async function ClockDisplay() {
  let label: string | null = null;

  try {
    const clock = await getClock();
    label = clock.toISOString().replace("T", " ").slice(0, 16) + "Z";
  } catch {
    label = null;
  }

  return (
    <div className="flex items-center gap-2">
      <Clock className="text-text-subtle size-3.5 shrink-0" aria-hidden />
      <span className="text-label text-text-subtle hidden sm:inline">
        demo clock
      </span>
      {label ? (
        <span className="text-mono text-text-muted tabular-nums">{label}</span>
      ) : (
        <span className="text-meta text-text-subtle" title="No database connection.">
          — no database —
        </span>
      )}
    </div>
  );
}
