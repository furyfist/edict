"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/app/_components/ui/button";
import { SidebarNav } from "./sidebar-nav";
import { NAV_ITEMS, isActive } from "./nav-items";
import type { Tone } from "@/app/_lib/tone";

/**
 * THE CONSOLE SHELL.
 *
 * ---------------------------------------------------------------------------
 * THREE STRUCTURAL DECISIONS
 *
 *   `h-dvh` + `overflow-hidden` on the outer flex means ONLY `<main>` scrolls.
 *   The sidebar and the top bar never scroll away, so the disclosure banner and
 *   the demo clock cannot be scrolled out of sight — which for this product is
 *   a correctness property, not a preference.
 *
 *   `min-w-0` on the content column. Without it a wide table forces the flex
 *   child to overflow and blows out the sidebar. It is the single most common
 *   layout bug in sidebar applications and it costs one class to prevent.
 *
 *   Below `lg` the sidebar is not merely hidden, it moves behind a drawer. A
 *   240px rail on a 375px viewport consumes 64% of the screen, and a nav with
 *   no way to dismiss it is worse than no nav.
 * ---------------------------------------------------------------------------
 */
export function ConsoleShell({
  railsLabel,
  railsTone,
  pendingCount,
  banners,
  clock,
  children,
}: {
  railsLabel: string;
  railsTone: Tone;
  pendingCount?: number;
  /** Server-rendered disclosure banners: rails state, halted state. */
  banners: React.ReactNode;
  /** The demo clock, read from the database rather than from wall time. */
  clock: React.ReactNode;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const current = NAV_ITEMS.find((item) => isActive(pathname, item.href));

  // ⌘1–8 jump between sections. Guarded so the shortcut cannot fire while
  // somebody is composing a policy or writing an injection payload.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!event.metaKey && !event.ctrlKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }
      const item = NAV_ITEMS.find((i) => String(i.shortcut) === event.key);
      if (!item) return;
      event.preventDefault();
      router.push(item.href);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [drawerOpen]);

  // Close on navigation, so a tap in the drawer does not leave it covering the
  // page it just opened.
  useEffect(() => setDrawerOpen(false), [pathname]);

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <a
        href="#main"
        className="bg-card text-body-strong sr-only rounded-md px-3 py-2 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:ring-3 focus:ring-ring/50"
      >
        Skip to content
      </a>

      <SidebarNav
        railsLabel={railsLabel}
        railsTone={railsTone}
        pendingCount={pendingCount}
        className="hidden lg:flex"
      />

      {drawerOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="animate-overlay-in absolute inset-0 bg-black/10 backdrop-blur-[2px]"
          />
          <div className="animate-drawer-in relative h-full w-60 shadow-e3">
            <SidebarNav
              railsLabel={railsLabel}
              railsTone={railsTone}
              pendingCount={pendingCount}
              onNavigate={() => setDrawerOpen(false)}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="absolute top-3 -right-11"
            >
              <X />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
              className="lg:hidden"
            >
              <Menu />
            </Button>
            <span className="text-body-strong text-foreground truncate">
              {current?.label ?? "Edict"}
            </span>
          </div>
          <div className="shrink-0">{clock}</div>
        </header>

        {banners}

        <main
          id="main"
          className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6"
        >
          {/* 1440px cap. Unbounded, a key/value grid on a 27" monitor stretches
              to ~2000px and the eye loses the rail between key and value. */}
          <div className="mx-auto w-full max-w-[1440px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
