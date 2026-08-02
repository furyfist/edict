import { railsState } from "@/lib/config/rails";

/**
 * Undismissable rails banner.
 *
 * Borrowed directly from Stripe's test-mode treatment: loud, permanent, and
 * impossible to confuse with production. Ambiguity about whether money is real
 * is the fastest way to lose a room, so this takes no props and has no dismiss
 * affordance by design.
 *
 * ---------------------------------------------------------------------------
 * IT READS THE SAME FACT THE CHARGE READS.
 *
 * The banner is derived from the credential and the host — not from a flag
 * somebody sets alongside them. A declaration and a credential can disagree,
 * and the one that moves money is the credential, so a banner sourced from
 * anywhere else is a banner that can eventually be wrong in the only direction
 * that matters.
 * ---------------------------------------------------------------------------
 */
export function SandboxBanner() {
  const { rails, detail, live } = railsState();

  if (rails === "MISCONFIGURED") {
    return (
      <div
        role="alert"
        className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-rose-500/40 bg-rose-500/20 px-4 py-1.5 text-center text-xs font-medium text-rose-100"
      >
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
        Misconfigured — the agent will not run. {detail}
      </div>
    );
  }

  if (live) {
    // Deliberately the loudest thing on the screen. If this is showing, a
    // mistake costs money rather than a rehearsal.
    return (
      <div
        role="alert"
        className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-rose-500/50 bg-rose-600/30 px-4 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-rose-50"
      >
        <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-rose-300" />
        Production — real money moves
      </div>
    );
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-1.5 text-center text-xs font-medium text-amber-200"
    >
      <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
      {rails === "MOCK"
        ? "Mock provider — no network, no real money. Usage data is seeded."
        : "Sandbox — no real money moves. Usage data is seeded."}
    </div>
  );
}
