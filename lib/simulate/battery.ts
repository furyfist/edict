import { cents } from "../contracts/money";
import type { Cents, EvidenceBundle, Proposal } from "../contracts";
import type { Scenario } from "./core";

/**
 * THE SCENARIO BATTERY — what a policy is rehearsed against.
 *
 * ---------------------------------------------------------------------------
 * THE DESIGN PROBLEM, STATED PLAINLY
 *
 * A preview is only worth showing if the battery behind it is not rigged, and
 * "not rigged" is a property of how scenarios are SELECTED, not of how they
 * behave. Any battery that picks which vendor gets which edge case invites the
 * obvious question — why that one? — and the honest answer would be "because it
 * demonstrated well."
 *
 * So there is no selection. The battery is the complete cross product: every
 * boundary case, applied to every vendor with a renewal, in a fixed order. The
 * only judgement in this file is WHICH BOUNDARIES EXIST, and that list is
 * visible, versioned, and short enough to read in one sitting.
 *
 * ---------------------------------------------------------------------------
 * SYNTHETIC IS SAID OUT LOUD
 *
 * Exactly one scenario per vendor is real: the renewal actually on the books.
 * Every other row is a hypothetical this module constructed, and it is labelled
 * `synthetic` in the data — not in a footnote — so nothing downstream can render
 * it as history by omission. The constructed proposals say so in their own
 * rationale text, because a rationale field that looks like model output is
 * exactly the kind of thing that gets screenshotted.
 *
 * ---------------------------------------------------------------------------
 * WHY THE PROPOSALS ARE CONSTRUCTED, NOT MODELLED
 *
 * A preview is a statement about AUTHORITY, not about any particular model's
 * judgement. Asking the agent to propose 72 times would make the preview slow,
 * non-deterministic, and about the wrong thing: the question is "what would this
 * policy permit," and the policy answers that identically whichever model asks.
 *
 * The battery is pure and deterministic. The same bundles produce the same
 * scenarios, byte for byte, forever — which is what makes a preview hash worth
 * signing.
 * ---------------------------------------------------------------------------
 */

/**
 * Bumped whenever the edge list below changes.
 *
 * Two previews are only comparable if they were rehearsed against the same
 * battery, and a diff between versions built from different batteries would be
 * measuring the battery rather than the policy.
 */
export const BATTERY_VERSION = "battery-1";

export interface Battery {
  version: string;
  /** Deterministic order: vendor, then the edge list below, top to bottom. */
  scenarios: Scenario[];
}

const SYNTHETIC_RATIONALE =
  "Synthetic scenario constructed by the battery. Not proposed by any model.";

function proposalFor(
  evidence: EvidenceBundle,
  amountCents: Cents,
  action: Proposal["action"] = "RENEW_AS_IS",
): Proposal {
  return {
    vendorId: evidence.vendorId,
    renewalId: evidence.renewalId,
    action,
    amountCents,
    currency: "USD",
    rationale: SYNTHETIC_RATIONALE,
    alternative: {
      action: "ESCALATE",
      reason: "Battery scenarios carry no alternative reasoning.",
    },
  };
}

/** A derived bundle keeps its own id, so two scenarios never share one. */
function variant(
  evidence: EvidenceBundle,
  kind: string,
  overrides: Partial<EvidenceBundle>,
): EvidenceBundle {
  return { ...evidence, bundleId: `${evidence.bundleId}::${kind}`, ...overrides };
}

interface Edge {
  kind: string;
  /** Rendered beside the row. Says what is being asked, in one line. */
  note: string;
  /**
   * Returns null when the edge cannot be constructed for this vendor — a
   * ceiling case needs a ceiling. Skipping is deterministic and visible in the
   * scenario count, never a silent substitution of a different question.
   */
  build(evidence: EvidenceBundle): { evidence: EvidenceBundle; proposal: Proposal } | null;
}

/**
 * THE EDGE LIST. The one judgement call in this file, kept short and readable.
 *
 * Each entry exists because it probes a different line in the engine: the
 * ceiling comparison, the completeness gates, the chargeability check, the
 * structural guards. Together they cover every path by which the engine can
 * refuse or escalate something a rule would otherwise have allowed.
 */
const EDGES: Edge[] = [
  {
    kind: "at-ceiling",
    note: "The largest charge this mandate can carry, to the cent.",
    build(evidence) {
      const remaining = evidence.mandate.remainingCents;
      if (remaining === null) return null;
      return {
        evidence: variant(evidence, "at-ceiling", {}),
        proposal: proposalFor(evidence, remaining),
      };
    },
  },
  {
    kind: "over-ceiling",
    note: "One cent past the ceiling. The other side of the same line.",
    build(evidence) {
      const remaining = evidence.mandate.remainingCents;
      if (remaining === null) return null;
      return {
        evidence: variant(evidence, "over-ceiling", {}),
        proposal: proposalFor(evidence, cents(remaining + 1)),
      };
    },
  },
  {
    kind: "price-shock",
    note: "The vendor triples its price between cycles.",
    build(evidence) {
      return {
        evidence: variant(evidence, "price-shock", {}),
        proposal: proposalFor(evidence, cents(evidence.renewal.amountCents * 3)),
      };
    },
  },
  {
    kind: "usage-unknown",
    note: "Usage data is missing. Unknown is never permission.",
    build(evidence) {
      return {
        evidence: variant(evidence, "usage-unknown", {
          seats: { assigned: evidence.seats.assigned, activeTrailing30d: null, activePct: null, detail: [] },
          completeness: { ...evidence.completeness, hasUsageData: false },
        }),
        proposal: proposalFor(evidence, evidence.renewal.amountCents),
      };
    },
  },
  {
    kind: "price-history-unknown",
    note: "No prior cycles, so no way to see an increase.",
    build(evidence) {
      return {
        evidence: variant(evidence, "price-history-unknown", {
          priceHistory: [],
          completeness: { ...evidence.completeness, hasPriceHistory: false },
        }),
        proposal: proposalFor(evidence, evidence.renewal.amountCents),
      };
    },
  },
  {
    kind: "mandate-paused",
    note: "The mandate is paused — authority exists but cannot be spent.",
    build(evidence) {
      if (evidence.mandate.mandateId === null) return null;
      return {
        evidence: variant(evidence, "mandate-paused", {
          mandate: { ...evidence.mandate, status: "PAUSED" },
        }),
        proposal: proposalFor(evidence, evidence.renewal.amountCents),
      };
    },
  },
  {
    kind: "mandate-absent",
    note: "No mandate at all. Spend outside the agent's authority entirely.",
    build(evidence) {
      return {
        evidence: variant(evidence, "mandate-absent", {
          mandate: {
            mandateId: null,
            status: null,
            capCents: null,
            remainingCents: null,
            expiresAt: null,
          },
          completeness: { ...evidence.completeness, hasMandate: false },
        }),
        proposal: proposalFor(evidence, evidence.renewal.amountCents),
      };
    },
  },
  {
    kind: "malformed-amount",
    note: "A zero-cent charge. Garbage is refused, never interpreted.",
    build(evidence) {
      return {
        evidence: variant(evidence, "malformed-amount", {}),
        proposal: proposalFor(evidence, cents(0)),
      };
    },
  },
];

/**
 * Builds the battery from the renewals currently on the books.
 *
 * Pure: the caller fetches the bundles. Input order is preserved, so the caller
 * decides what "vendor order" means and the battery does not quietly re-sort it.
 */
export function buildBattery(bundles: EvidenceBundle[]): Battery {
  const scenarios: Scenario[] = [];

  for (const evidence of bundles) {
    scenarios.push({
      id: `${evidence.vendorId}::history`,
      label: `${evidence.vendorName} — renewal on the books`,
      origin: "history",
      note: null,
      evidence,
      proposal: {
        ...proposalFor(evidence, evidence.renewal.amountCents),
        rationale:
          "The renewal as it currently stands. Amount and evidence are real.",
      },
    });

    for (const edge of EDGES) {
      const built = edge.build(evidence);
      // A skipped edge is a question this vendor cannot be asked, not a
      // question quietly answered some other way.
      if (!built) continue;

      scenarios.push({
        id: `${evidence.vendorId}::${edge.kind}`,
        label: `${evidence.vendorName} — ${edge.kind.replace(/-/g, " ")}`,
        origin: "synthetic",
        note: edge.note,
        evidence: built.evidence,
        proposal: built.proposal,
      });
    }
  }

  return { version: BATTERY_VERSION, scenarios };
}

/** The edge kinds, for documentation and for tests that assert coverage. */
export const EDGE_KINDS = EDGES.map((edge) => edge.kind);
