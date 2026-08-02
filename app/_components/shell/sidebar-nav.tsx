"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/app/_lib/cn";
import { Badge } from "@/app/_components/ui/badge";
import { NAV_SECTIONS, isActive } from "./nav-items";
import type { Tone } from "@/app/_lib/tone";

/**
 * The sidebar.
 *
 * ---------------------------------------------------------------------------
 * WHY IT READS AS ONE CALM SURFACE
 *
 * `bg-sidebar` is aliased to the app background. The sidebar is the SAME COLOUR
 * as the page it sits beside, separated only by a hairline — no slab of
 * contrasting grey. That single decision is the biggest reason the shell feels
 * light rather than heavy.
 *
 * Hover is the active style at 60% opacity. Hover is a preview of active, not a
 * different visual language, which is why moving down the list feels
 * continuous instead of flickering between two treatments.
 *
 * Three vertical rails hold every row: a fixed `size-4` icon, a `flex-1
 * truncate` label, and `shrink-0` trailing metadata. A long label degrades to
 * an ellipsis; it never wraps and never pushes the shortcut hint out.
 * ---------------------------------------------------------------------------
 */
export function SidebarNav({
  railsLabel,
  railsTone,
  pendingCount,
  onNavigate,
  className,
}: {
  railsLabel: string;
  railsTone: Tone;
  /** Undefined means not loaded. It renders nothing — never a fabricated zero. */
  pendingCount?: number;
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "bg-sidebar border-sidebar-border flex h-full w-60 shrink-0 flex-col border-r",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-4">
        <Link
          href="/"
          className="text-section-title text-foreground rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Edict
        </Link>
        <Badge tone={railsTone}>{railsLabel}</Badge>
      </div>

      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-2">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-4" role="group" aria-label={section.title}>
            <div className="text-label text-text-subtle px-2 pb-1">
              {section.title}
            </div>
            <ul className="flex flex-col gap-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href);
                const Icon = item.icon;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "text-body-strong flex items-center gap-2 rounded-md px-2 py-1.5",
                        "outline-none transition-colors duration-[var(--duration-hover)]",
                        "focus-visible:ring-3 focus-visible:ring-ring/50",
                        active
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>

                      {/* Rendered only when there is something waiting. An
                          absent count renders nothing rather than "(0)". */}
                      {item.href === "/console/approvals" && pendingCount ? (
                        <span aria-live="polite" className="shrink-0">
                          <Badge tone="medium">{pendingCount}</Badge>
                        </span>
                      ) : (
                        <kbd className="text-text-subtle text-meta hidden shrink-0 lg:inline">
                          ⌘{item.shortcut}
                        </kbd>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-border flex flex-col gap-2 border-t px-2 py-3">
        <a
          href="/api/receipts?download=1"
          className="text-meta text-text-muted hover:bg-surface-subtle hover:text-foreground rounded-md px-2 py-1.5 transition-colors"
        >
          Export the receipt chain
        </a>
        <p className="text-meta text-text-subtle px-2">
          Verify it offline — no database, no network, and none of our code
          required to believe the answer.
        </p>
      </div>
    </aside>
  );
}
