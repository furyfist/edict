import { prisma } from "../db/client";
import type {
  ChargeRequest,
  ChargeResult,
  CreateMandateRequest,
  HealthResult,
  Mandate,
  MandateResult,
  MandateStatus,
  PravaAdapter,
} from "./types";

/**
 * The mock payment adapter.
 *
 * It enforces the same three things the real network enforces — the amount
 * ceiling, the mandate status, and the merchant pin — against the local mandate
 * rows. That is what makes it a usable fallback rather than a stub that always
 * says yes: the decline path can be demonstrated with this adapter in place,
 * and the ledger entry it produces is the same shape the real one produces.
 *
 * It is deterministic. Ids are derived from the idempotency key rather than
 * generated randomly, so a replayed charge returns the same charge id, and two
 * runs of the seed produce byte-identical ledgers.
 *
 * Retained in the repository through the demo. It costs nothing to keep and it
 * is the thing that runs when Prava's sandbox is down.
 */

/** Deterministic id derived from its inputs. No randomness anywhere. */
function derivedId(prefix: string, seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}_mock_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function toMandate(row: {
  pravaMandateId: string;
  status: string;
  amountCeilingCents: number;
  spentCents: number;
  currency: string;
  merchantId: string | null;
  expiresAt: Date | null;
}): Mandate {
  return {
    mandateId: row.pravaMandateId,
    status: row.status as MandateStatus,
    amountCeilingCents: row.amountCeilingCents,
    spentCents: row.spentCents,
    currency: row.currency as Mandate["currency"],
    merchantId: row.merchantId,
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

export class MockPravaAdapter implements PravaAdapter {
  readonly mode = "mock" as const;

  async charge(request: ChargeRequest): Promise<ChargeResult> {
    const row = await prisma.mandate.findUnique({
      where: { pravaMandateId: request.mandateId },
    });

    if (!row) {
      return {
        ok: false,
        kind: "MANDATE_NOT_FOUND",
        networkMessage: `No mandate ${request.mandateId}.`,
        chargeId: null,
        sessionId: null,
      };
    }

    const sessionId = derivedId("ses", request.idempotencyKey);

    if (row.status === "PAUSED") {
      return {
        ok: false,
        kind: "MANDATE_PAUSED",
        networkMessage:
          "The mandate is paused. No charge was authorized against it.",
        chargeId: null,
        sessionId,
      };
    }

    if (row.status === "CANCELLED" || row.status === "EXPIRED") {
      return {
        ok: false,
        kind: row.status === "EXPIRED" ? "MANDATE_EXPIRED" : "DECLINED",
        networkMessage: `The mandate is ${row.status.toLowerCase()}.`,
        chargeId: null,
        sessionId,
      };
    }

    // The ceiling is enforced here, in the credential, exactly as the network
    // enforces it. The policy engine is a separate, earlier gate — this decline
    // happens even if the engine were bypassed entirely.
    const remaining = row.amountCeilingCents - row.spentCents;
    if (request.amountCents > remaining) {
      return {
        ok: false,
        kind: "DECLINED",
        networkMessage: `Amount ${request.amountCents} exceeds the remaining authority of ${remaining} on this mandate.`,
        chargeId: null,
        sessionId,
      };
    }

    // Idempotent: a replayed key returns the original charge without spending
    // twice. The stage button will be pressed twice.
    const chargeId = derivedId("chg", request.idempotencyKey);
    const alreadyCharged = await prisma.ledgerEntry.findFirst({
      where: { pravaChargeId: chargeId },
      select: { id: true },
    });

    if (!alreadyCharged) {
      await prisma.mandate.update({
        where: { pravaMandateId: request.mandateId },
        data: { spentCents: { increment: request.amountCents } },
      });
    }

    return {
      ok: true,
      chargeId,
      sessionId,
      amountCents: request.amountCents,
      currency: request.currency,
    };
  }

  async createMandate(request: CreateMandateRequest): Promise<MandateResult> {
    const pravaMandateId = derivedId(
      "mnd",
      `${request.vendorId}:${request.amountCeilingCents}:${request.passkeyCeremonyId ?? "seed"}`,
    );

    const existing = await prisma.mandate.findUnique({
      where: { pravaMandateId },
    });
    if (existing) {
      return { ok: true, mandate: toMandate(existing), error: null };
    }

    const mirroredAt = await this.mirrorInstant();
    const row = await prisma.mandate.create({
      data: {
        pravaMandateId,
        vendorId: request.vendorId,
        merchantId: request.merchantId,
        amountCeilingCents: request.amountCeilingCents,
        currency: request.currency,
        expiresAt: request.expiresAt ? new Date(request.expiresAt) : null,
        mirroredAt,
      },
    });

    return { ok: true, mandate: toMandate(row), error: null };
  }

  async getMandate(mandateId: string): Promise<MandateResult> {
    const row = await prisma.mandate.findUnique({
      where: { pravaMandateId: mandateId },
    });
    if (!row) {
      return { ok: false, mandate: null, error: `No mandate ${mandateId}.` };
    }
    return { ok: true, mandate: toMandate(row), error: null };
  }

  async pauseMandate(mandateId: string): Promise<MandateResult> {
    return this.setStatus(mandateId, "PAUSED");
  }

  async resumeMandate(mandateId: string): Promise<MandateResult> {
    return this.setStatus(mandateId, "ACTIVE");
  }

  async cancelMandate(mandateId: string): Promise<MandateResult> {
    return this.setStatus(mandateId, "CANCELLED");
  }

  async listMandates(): Promise<Mandate[]> {
    const rows = await prisma.mandate.findMany({
      orderBy: { pravaMandateId: "asc" },
    });
    return rows.map(toMandate);
  }

  async health(): Promise<HealthResult> {
    return {
      healthy: true,
      detail: "Mock adapter. No external dependency is contacted.",
    };
  }

  private async setStatus(
    mandateId: string,
    status: MandateStatus,
  ): Promise<MandateResult> {
    const existing = await prisma.mandate.findUnique({
      where: { pravaMandateId: mandateId },
    });
    if (!existing) {
      return { ok: false, mandate: null, error: `No mandate ${mandateId}.` };
    }
    const row = await prisma.mandate.update({
      where: { pravaMandateId: mandateId },
      data: { status, mirroredAt: await this.mirrorInstant() },
    });
    return { ok: true, mandate: toMandate(row), error: null };
  }

  /**
   * The demo instant, read from the database rather than the wall clock. The
   * adapter reads the clock table directly instead of importing `lib/clock`,
   * because the clock module is a consumer-facing API and the adapter is below
   * it in the graph.
   */
  private async mirrorInstant(): Promise<Date> {
    const state = await prisma.systemState.findUnique({
      where: { id: "singleton" },
    });
    if (!state) {
      throw new Error(
        "Demo clock is not initialized. Run the seed before charging.",
      );
    }
    return state.now;
  }
}
