import Link from "next/link";
import { db } from "@/lib/db/client";

/**
 * Global halted banner.
 *
 * When the kill switch is engaged the agent has no authority anywhere, and that
 * fact belongs on every page rather than only on the one where it was pulled. A
 * user who navigates away from Authority should not lose sight of the fact that
 * the system is stopped.
 *
 * `aria-live="assertive"`: this is a state change nobody asked for and everybody
 * needs to hear about.
 *
 * Renders nothing when the agent is live, so it costs no visual space in the
 * normal case.
 */
export async function HaltedBanner() {
  let engaged = false;

  try {
    const state = await db.systemState.findUnique({
      where: { id: "singleton" },
      select: { killSwitchEngaged: true },
    });
    engaged = state?.killSwitchEngaged ?? false;
  } catch {
    return null;
  }

  if (!engaged) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-risk-high-bg text-risk-high border-risk-high/40 text-meta shrink-0 border-b px-6 py-1.5 text-center"
    >
      Agent halted — every mandate is paused and ticks will not run.{" "}
      <Link
        href="/console/authority"
        className="font-medium underline underline-offset-2"
      >
        Restore authority
      </Link>
    </div>
  );
}
