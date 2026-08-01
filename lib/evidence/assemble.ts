import { cents } from "../contracts/money";
import { daysBetween, isoDate, startOfDay } from "../clock";
import type {
  EvidenceBundle,
  Frequency,
  MandateStatus,
  SeatDetail,
} from "../contracts";

/**
 * Pure assembly of an evidence bundle from raw rows.
 *
 * Kept separate from the database read so the mapping — which is where the
 * interesting decisions live — can be reasoned about and exercised without a
 * Postgres connection. `lib/evidence/index.ts` does the querying and calls this.
 *
 * The rule that matters here: **absence is recorded as absence.** A vendor with
 * no usage rows gets `activeTrailing30d: null` and `hasUsageData: false`, never
 * `0`. Zero active seats is a fact that would justify cancelling; unknown usage
 * is a gap that must reach a human. Collapsing the two would be the single most
 * dangerous bug this system could have.
 */

const TRAILING_WINDOW_DAYS = 30;

export interface EvidenceInput {
  /** Demo clock. Never wall time. */
  clock: Date;
  bundleId: string;

  vendor: { id: string; name: string; category: string };
  renewal: {
    id: string;
    cycleStart: Date;
    dueDate: Date;
    amountCents: number;
    currency: string;
    frequency: Frequency;
  };
  seats: Array<{ id: string; email: string }>;
  usage: Array<{ seatId: string; day: Date; loggedIn: boolean }>;
  /** Prior cycles for this vendor, any order. */
  priceHistory: Array<{ cycleStart: Date; amountCents: number }>;
  mandate: {
    pravaMandateId: string;
    status: MandateStatus;
    capCents: number;
    remainingCents: number;
    expiresAt: Date | null;
  } | null;
  messages: Array<{
    id: string;
    receivedAt: Date;
    fromAddr: string;
    subject: string;
    body: string;
    injected: boolean;
  }>;
}

export function assembleEvidence(input: EvidenceInput): EvidenceBundle {
  const { clock, vendor, renewal, seats, usage, priceHistory, mandate, messages } =
    input;

  const hasUsageData = seats.length > 0 && usage.length > 0;

  // Most recent login per seat.
  const lastLogin = new Map<string, Date>();
  for (const record of usage) {
    if (!record.loggedIn) continue;
    const current = lastLogin.get(record.seatId);
    if (!current || record.day > current) {
      lastLogin.set(record.seatId, record.day);
    }
  }

  const detail: SeatDetail[] = seats.map((seat) => {
    const last = lastLogin.get(seat.id);
    return {
      seatId: seat.id,
      email: seat.email,
      lastLoginDaysAgo: last ? daysBetween(last, clock) : null,
    };
  });

  const activeTrailing30d = hasUsageData
    ? detail.filter(
        (seat) =>
          seat.lastLoginDaysAgo !== null &&
          seat.lastLoginDaysAgo <= TRAILING_WINDOW_DAYS,
      ).length
    : null;

  const activePct =
    activeTrailing30d === null || seats.length === 0
      ? null
      : Math.round((activeTrailing30d / seats.length) * 100);

  const sortedHistory = [...priceHistory].sort(
    (a, b) => a.cycleStart.getTime() - b.cycleStart.getTime(),
  );

  return {
    bundleId: input.bundleId,
    asOf: clock.toISOString(),

    vendorId: vendor.id,
    vendorName: vendor.name,
    category: vendor.category,

    renewalId: renewal.id,
    cycleStart: isoDate(renewal.cycleStart),

    seats: {
      assigned: seats.length,
      activeTrailing30d,
      activePct,
      detail,
    },

    renewal: {
      amountCents: cents(renewal.amountCents),
      currency: "USD",
      frequency: renewal.frequency,
      dueDate: isoDate(renewal.dueDate),
      daysUntilDue: daysBetween(startOfDay(clock), renewal.dueDate),
    },

    priceHistory: sortedHistory.map((point) => ({
      cycleStart: isoDate(point.cycleStart),
      amountCents: cents(point.amountCents),
    })),

    mandate: mandate
      ? {
          mandateId: mandate.pravaMandateId,
          status: mandate.status,
          capCents: cents(mandate.capCents),
          remainingCents: cents(mandate.remainingCents),
          expiresAt: mandate.expiresAt ? mandate.expiresAt.toISOString() : null,
        }
      : {
          mandateId: null,
          status: null,
          capCents: null,
          remainingCents: null,
          expiresAt: null,
        },

    inboundMessages: messages.map((message) => ({
      id: message.id,
      receivedAt: message.receivedAt.toISOString(),
      from: message.fromAddr,
      subject: message.subject,
      body: message.body,
      injected: message.injected,
    })),

    completeness: {
      hasUsageData,
      hasPriceHistory: sortedHistory.length > 0,
      hasMandate: mandate !== null,
    },
  };
}
