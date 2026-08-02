import {
  Bug,
  Building2,
  Gauge,
  Receipt,
  ScrollText,
  ShieldAlert,
  ShieldX,
  Swords,
  type LucideIcon,
} from "lucide-react";

/**
 * The eight routes, grouped by OPERATOR INTENT rather than by backend module.
 *
 * The grouping encodes the demo journey and the mental model behind it:
 *
 *   RECORD       what it did, and what it would not do
 *   AUTHORITY    where its permission comes from, and how much is left
 *   EVIDENCE     the facts behind a decision, and where it stopped to ask
 *   ADVERSARIAL  the surface for attacking it, and the standing measurement
 *
 * Sections are separated by 16px of whitespace and glued to their own 11px
 * uppercase header by 4px. That asymmetry IS the grouping mechanism — the
 * sidebar contains exactly two borders, its right edge and the footer rule,
 * and no dividers at all.
 *
 * Each icon is a metaphor for the QUESTION its page answers, not for the data
 * type it holds: `Gauge` is "read the instruments", not "there is a number
 * here"; `ShieldX` is "it declined", not "there is a list here".
 */
export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** ⌘N. Rendered as a hint from `lg` up, where the shortcut is usable. */
  shortcut: number;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: "Record",
    items: [
      { href: "/console", label: "Ledger", icon: Receipt, shortcut: 1 },
      { href: "/console/refusals", label: "Refusals", icon: ShieldX, shortcut: 2 },
    ],
  },
  {
    title: "Authority",
    items: [
      { href: "/console/policy", label: "Policy", icon: ScrollText, shortcut: 3 },
      { href: "/console/authority", label: "Authority", icon: Gauge, shortcut: 4 },
    ],
  },
  {
    title: "Evidence",
    items: [
      { href: "/console/vendors", label: "Vendors", icon: Building2, shortcut: 5 },
      {
        href: "/console/approvals",
        label: "Approvals",
        icon: ShieldAlert,
        shortcut: 6,
      },
    ],
  },
  {
    title: "Adversarial",
    items: [
      { href: "/console/attack", label: "Attack", icon: Bug, shortcut: 7 },
      { href: "/console/gauntlet", label: "Gauntlet", icon: Swords, shortcut: 8 },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_SECTIONS.flatMap((s) => s.items);

/** Exact match for the index route, prefix match for everything else. */
export function isActive(pathname: string, href: string): boolean {
  return href === "/console" ? pathname === "/console" : pathname.startsWith(href);
}
