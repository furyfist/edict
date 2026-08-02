import { railsState } from "@/lib/config/rails";
import { cn } from "@/app/_lib/cn";

/**
 * Undismissable rails banner.
 *
 * Borrowed directly from Stripe's test-mode treatment: permanent and impossible
 * to confuse with production. Ambiguity about whether money is real is the
 * fastest way to lose a room, so this takes no props and has no dismiss
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
 *
 * It sits BETWEEN the top bar and `<main>` rather than over them, so it pushes
 * content down instead of covering it. `py-1.5` — six pixels of height carrying
 * the most consequential sentence in the shell.
 */
export function SandboxBanner() {
  const { rails, detail, live } = railsState();

  const banner =
    rails === "MISCONFIGURED"
      ? {
          role: "alert" as const,
          tone: "bg-risk-high-bg text-risk-high border-risk-high/40",
          text: `Misconfigured — the agent will not run. ${detail}`,
        }
      : live
        ? {
            // Deliberately the loudest thing on the screen. If this is showing,
            // a mistake costs money rather than a rehearsal.
            role: "alert" as const,
            tone: "bg-risk-high-bg text-risk-high border-risk-high/40",
            text: "Production — real money moves.",
          }
        : {
            role: "status" as const,
            tone: "bg-risk-medium-bg text-risk-medium border-risk-medium/40",
            text:
              rails === "MOCK"
                ? "Mock provider — no network, no real money. Usage data is seeded."
                : "Sandbox — no real money moves. Usage data is seeded.",
          };

  return (
    <div
      role={banner.role}
      className={cn(
        "text-meta shrink-0 border-b px-6 py-1.5 text-center",
        banner.tone,
      )}
    >
      {banner.text}
    </div>
  );
}
