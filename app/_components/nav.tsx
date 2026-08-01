"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * The seven routes. Nothing else ships.
 *
 * Order is deliberate and mirrors the demo journey: what it did, what it
 * refused, where its authority comes from, how much rope remains, the evidence,
 * where it stopped to ask, and the surface for attacking it.
 */
const ROUTES = [
  { href: "/", label: "Ledger" },
  { href: "/refusals", label: "Refusals" },
  { href: "/policy", label: "Policy" },
  { href: "/authority", label: "Authority" },
  { href: "/vendors", label: "Vendors" },
  { href: "/approvals", label: "Approvals" },
  { href: "/attack", label: "Attack" },
] as const;

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-1">
      {ROUTES.map((route) => {
        const active =
          route.href === "/"
            ? pathname === "/"
            : pathname.startsWith(route.href);

        return (
          <Link
            key={route.href}
            href={route.href}
            aria-current={active ? "page" : undefined}
            className={
              active
                ? "rounded-md bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-100"
                : "rounded-md px-2.5 py-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-200"
            }
          >
            {route.label}
          </Link>
        );
      })}
    </nav>
  );
}
