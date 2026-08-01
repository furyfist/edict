/**
 * The sandbox banner.
 *
 * It is a plain server-rendered element with no dismiss control and no client
 * state. That is deliberate: a banner that can be dismissed is a banner that
 * will be dismissed before a screenshot, and the disclosure only counts if it
 * is present on every page every time.
 */
export function SandboxBanner() {
  return (
    <div
      role="note"
      style={{
        background: "var(--sandbox)",
        color: "#fff",
        padding: "6px 16px",
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.02em",
        display: "flex",
        gap: 8,
        alignItems: "center",
      }}
    >
      <span>SANDBOX</span>
      <span style={{ fontWeight: 400, opacity: 0.9 }}>
        No real money moves. Payments run against the Prava sandbox and vendor
        data is seeded.
      </span>
    </div>
  );
}
