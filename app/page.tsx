import { prisma } from "@/lib/db/client";
import { ROUTES } from "./components/Nav";

export const dynamic = "force-dynamic";

/**
 * Placeholder home page reading real rows. It exists in M0 to prove the
 * deployment reaches the database; the surfaces that matter arrive in M3.
 */
export default async function HomePage() {
  let vendors: { id: string; name: string; category: string }[] = [];
  let error: string | null = null;

  try {
    vendors = await prisma.vendor.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true },
    });
  } catch {
    error = "No database connection. Set DATABASE_URL and run the seed.";
  }

  return (
    <>
      <h1 style={{ fontSize: 22 }}>Spend Guardian</h1>
      <p style={{ color: "var(--muted)", maxWidth: 640 }}>
        A human writes a spending policy in English. The policy compiles into
        mandates. An agent proposes renewals unattended, a deterministic engine
        adjudicates them, and the network executes only what is permitted.
      </p>

      <h2 style={{ fontSize: 14, marginTop: 28 }}>Seeded vendors</h2>
      {error ? (
        <p style={{ color: "var(--escalate)" }}>{error}</p>
      ) : vendors.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>None yet. Run the seed.</p>
      ) : (
        <ul style={{ paddingLeft: 18, color: "var(--muted)" }}>
          {vendors.map((v) => (
            <li key={v.id}>
              {v.name} <span className="mono">({v.category})</span>
            </li>
          ))}
        </ul>
      )}

      <h2 style={{ fontSize: 14, marginTop: 28 }}>Surfaces</h2>
      <ul style={{ paddingLeft: 18, color: "var(--muted)" }}>
        {ROUTES.map((r) => (
          <li key={r.href}>
            <strong style={{ color: "var(--text)" }}>{r.label}</strong> —{" "}
            {r.question}
          </li>
        ))}
      </ul>
    </>
  );
}
