/**
 * THE TONE MAP — the single source of colour meaning.
 *
 * ---------------------------------------------------------------------------
 * WHY EVERY BADGE IN THE APPLICATION READS FROM THIS FILE
 *
 * There are nine surfaces in this product that colour something by its state:
 * ledger outcomes, receipt status, policy effects, approval status, mandate
 * status, gauntlet verdicts, reconciliation results, rails state, and preview
 * groupings. Before this file existed each one carried its own hex-adjacent
 * Tailwind triple, and they had already drifted — `REQUIRE_APPROVAL` was sky
 * on the Policy page and the same concept was amber on Approvals.
 *
 * A colour decision is made once here and cannot drift, because there is
 * nowhere else to make it. Adding a tenth surface is a mapping function, never
 * a new palette.
 * ---------------------------------------------------------------------------
 *
 * The chip formula is always the same triple:
 *
 *     tinted background + coloured text + 1px coloured border at 40% opacity
 *
 * There are no saturated colour blocks anywhere in the console. Solid red is
 * reserved for the confirm action inside a destructive dialog, and appears at
 * most once per screen.
 */

export type Tone =
  | "neutral"
  | "low"
  | "medium"
  | "high"
  | "success"
  | "warn"
  | "danger"
  | "info";

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-subtle text-text-muted border-border",
  low: "bg-risk-low-bg text-risk-low border-risk-low/40",
  medium: "bg-risk-medium-bg text-risk-medium border-risk-medium/40",
  high: "bg-risk-high-bg text-risk-high border-risk-high/40",
  success: "bg-risk-low-bg text-success border-success/40",
  warn: "bg-risk-medium-bg text-warn border-warn/40",
  danger: "bg-risk-high-bg text-danger border-danger/40",
  info: "bg-accent-subtle text-info border-info/40",
};

/** Text-only tone, for a number in a table cell that must not become a chip. */
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-text-muted",
  low: "text-risk-low",
  medium: "text-risk-medium",
  high: "text-risk-high",
  success: "text-success",
  warn: "text-warn",
  danger: "text-danger",
  info: "text-info",
};

// ---------------------------------------------------------------------------
// Domain enum → tone. Pure functions, one per vocabulary.
//
// The vocabularies are deliberately kept apart even where they rhyme. A ledger
// outcome and a gauntlet verdict are not the same kind of fact, and conflating
// two vocabularies is how a reader ends up misled by a colour.
// ---------------------------------------------------------------------------

/** Ledger outcome: what the agent did. */
export function outcomeTone(outcome: string): Tone {
  switch (outcome) {
    case "EXECUTED":
      return "success";
    case "ESCALATED":
      return "info";
    case "REFUSED":
      return "warn";
    case "FAILED":
      return "danger";
    default:
      return "neutral";
  }
}

/** Receipt integrity. UNATTESTED is neutral, never a warning — an entry written
 *  before receipts existed is not a forgery. */
export function receiptTone(status: string): Tone {
  switch (status) {
    case "VALID":
      return "success";
    case "INVALID":
    case "BROKEN_LINK":
      return "danger";
    default:
      return "neutral";
  }
}

/** Policy effect: what a rule does. */
export function effectTone(effect: string): Tone {
  switch (effect) {
    case "ALLOW_AUTO":
      return "success";
    case "REQUIRE_APPROVAL":
      return "info";
    case "DENY":
      return "danger";
    default:
      return "neutral";
  }
}

/** Approval lifecycle. PENDING is amber because it is the state that needs a
 *  human; REJECTED is neutral because a decided thing is not an alarm. */
export function approvalTone(status: string): Tone {
  switch (status) {
    case "PENDING":
      return "medium";
    case "APPROVED":
      return "success";
    case "EXPIRED":
      return "warn";
    default:
      return "neutral";
  }
}

/** Gauntlet verdict. UNEXPECTED is amber, not red: authority held, a prediction
 *  missed. */
export function verdictTone(verdict: string): Tone {
  switch (verdict) {
    case "DEFENDED":
      return "success";
    case "BREACHED":
      return "danger";
    case "UNEXPECTED":
      return "warn";
    default:
      return "neutral";
  }
}

/** Reconciliation. UNVERIFIABLE must never resolve to the same tone as
 *  BALANCED — a provider outage rendering as proof of completeness is the most
 *  dangerous simplification available anywhere in this product. */
export function reconcileTone(status: string): Tone {
  switch (status) {
    case "BALANCED":
      return "success";
    case "DISCREPANT":
      return "danger";
    case "UNVERIFIABLE":
      return "warn";
    default:
      return "neutral";
  }
}

/** Mandate lifecycle. */
export function mandateTone(status: string): Tone {
  return status === "ACTIVE" ? "success" : "warn";
}

/** Turn a SCREAMING_SNAKE enum into readable lower-case prose. */
export function humanise(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}
