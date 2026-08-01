import Link from "next/link";
import { db } from "@/lib/db/client";

/**
 * Global halted banner.
 *
 * When the kill switch is engaged the agent has no authority anywhere, and that
 * fact belongs on every page rather than only on the one where it was pulled.
 * A user who navigates away from Authority should not lose sight of the fact
 * that the system is stopped.
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
    <div className="border-b border-rose-500/30 bg-rose-500/15 px-4 py-1.5 text-center text-xs font-medium text-rose-200">
      Agent halted — every mandate is paused and ticks will not run.{" "}
      <Link href="/authority" className="underline underline-offset-2">
        Restore authority
      </Link>
    </div>
  );
}
