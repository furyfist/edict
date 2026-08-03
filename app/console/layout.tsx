import { railsState } from "@/lib/config/rails";
import { db } from "@/lib/db/client";
import { ConsoleShell } from "@/app/_components/shell/console-shell";
import { HaltedBanner } from "@/app/_components/shell/halted-banner";
import { ClockDisplay } from "@/app/_components/shell/clock-display";
import { railsChip } from "@/app/_components/shell/rails";

export const dynamic = "force-dynamic";

/**
 * The console shell — sidebar, top bar, disclosure banners, scrolling main.
 *
 * The halted banner is rendered here rather than at the root because the
 * marketing entry page is not the product: it belongs on every surface where
 * a decision can be taken, and nowhere else.
 *
 * `pendingCount` is UNDEFINED when the database cannot be read, and the badge
 * renders nothing in that case. A zero would be a claim — "nothing is waiting
 * on you" — that an unreachable database does not entitle us to make.
 */
export default async function ConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { rails } = railsState();
  const chip = railsChip(rails);

  let pendingCount: number | undefined;
  try {
    pendingCount = await db.approval.count({ where: { status: "PENDING" } });
  } catch {
    pendingCount = undefined;
  }

  return (
    <ConsoleShell
      railsLabel={chip.label}
      railsTone={chip.tone}
      pendingCount={pendingCount}
      clock={<ClockDisplay />}
      banners={<HaltedBanner />}
    >
      {children}
    </ConsoleShell>
  );
}
