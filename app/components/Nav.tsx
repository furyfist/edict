import Link from "next/link";

/**
 * The seven routes. Each answers exactly one question, and the order is the
 * order a judge is most likely to want them in: what happened, what was
 * refused, what authority exists, where that authority came from, what is
 * being spent on, what needs a human, and the attack console last.
 */
export const ROUTES = [
  { href: "/ledger", label: "Ledger", question: "What has happened?" },
  { href: "/refusals", label: "Refusals", question: "What was refused?" },
  { href: "/authority", label: "Authority", question: "What can it spend?" },
  { href: "/policy", label: "Policy", question: "Where does authority come from?" },
  { href: "/vendors", label: "Vendors", question: "What is the evidence?" },
  { href: "/approvals", label: "Approvals", question: "What needs a human?" },
  { href: "/attack", label: "Attack", question: "What if it is manipulated?" },
] as const;

export function Nav() {
  return (
    <nav
      style={{
        display: "flex",
        gap: 2,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "var(--panel)",
      }}
    >
      <Link
        href="/"
        style={{
          padding: "12px 14px 11px",
          fontWeight: 700,
          letterSpacing: "-0.02em",
          marginRight: 8,
        }}
      >
        edict
      </Link>
      {ROUTES.map((r) => (
        <Link
          key={r.href}
          href={r.href}
          title={r.question}
          style={{
            padding: "12px 14px 11px",
            fontSize: 13,
            color: "var(--muted)",
          }}
        >
          {r.label}
        </Link>
      ))}
    </nav>
  );
}
