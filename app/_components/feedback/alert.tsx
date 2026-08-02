import { AlertTriangle, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/app/_lib/cn";
import { TONE_CLASSES, type Tone } from "@/app/_lib/tone";

/**
 * Inline alerts, chosen by PERSISTENCE semantics rather than by severity.
 *
 * Nothing in this product auto-dismisses. An unresolved consequence — a
 * discrepant reconciliation, a passkey ceremony that could not be opened, a
 * broken chain link — must not vanish after four seconds, so it is an inline
 * alert and not a toast. The rule is simple: if the user still has to do
 * something about it, it stays on the screen.
 *
 * The server's own message is rendered VERBATIM in mono. Machine text stays
 * machine text; paraphrasing an error is how a user ends up unable to search
 * for it.
 */
const TONE_ICON: Partial<Record<Tone, typeof AlertTriangle>> = {
  danger: AlertTriangle,
  high: AlertTriangle,
  warn: TriangleAlert,
  medium: TriangleAlert,
  info: Info,
};

export function Alert({
  tone = "danger",
  title,
  detail,
  children,
  className,
}: {
  tone?: Tone;
  title: React.ReactNode;
  /** The server's message, rendered as-is. */
  detail?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const Icon = TONE_ICON[tone];

  return (
    <div
      role={tone === "danger" || tone === "high" ? "alert" : "status"}
      className={cn(
        "flex flex-col items-start gap-2 rounded-md border p-4",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {Icon ? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> : null}
        <span className="text-body-strong">{title}</span>
      </div>
      {detail ? (
        <p className="text-mono text-foreground/80 w-full break-words whitespace-pre-wrap">
          {detail}
        </p>
      ) : null}
      {children ? (
        <div className="text-meta text-foreground/80 w-full">{children}</div>
      ) : null}
    </div>
  );
}

/**
 * The database is unreachable. Never a blank screen, and never an error either
 * — an unconfigured environment is a setup step, not a failure.
 */
export function DbUnavailable() {
  return (
    <Alert tone="warn" title="No database connection.">
      Set{" "}
      <code className="text-mono text-foreground">DATABASE_URL</code>, then run{" "}
      <code className="text-mono text-foreground">
        npm run db:push &amp;&amp; npm run seed
      </code>
      .
    </Alert>
  );
}
