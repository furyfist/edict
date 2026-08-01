/**
 * Undismissable sandbox banner.
 *
 * Borrowed directly from Stripe's test-mode treatment: loud, permanent, and
 * impossible to confuse with production. Ambiguity about whether money is real
 * is the fastest way to lose a room, so this component takes no props and has
 * no dismiss affordance by design.
 */
export function SandboxBanner() {
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-1.5 text-center text-xs font-medium text-amber-200"
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
      />
      Sandbox — no real money moves. Usage data is seeded.
    </div>
  );
}
