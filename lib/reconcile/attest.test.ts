import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { subjectOf } from "./attest";
import { containmentSentence } from "./run";
import type { ReconciliationRun } from "./run";
import { buildEnvelope, signClaim, verifyClaim } from "../attest/claims";
import {
  generateSigningIdentity,
  getPublicIdentity,
  resetSigningIdentityCache,
} from "../attest/keys";
import { cents } from "../contracts/money";

/**
 * What the attestation must not allow anyone to do: change what it found.
 *
 * The subject is built here rather than run against a database, because the
 * property under test belongs to the claim, not to the query.
 */

const HEAD = "9".repeat(64);

function run(overrides: Partial<ReconciliationRun> = {}): ReconciliationRun {
  return {
    status: "BALANCED",
    ranAt: "2026-03-01T09:00:00.000Z",
    provider: "mock",
    mandatesChecked: 8,
    entriesChecked: 4,
    chargesChecked: 4,
    matched: 4,
    discrepancies: [],
    unreadable: [],
    ...overrides,
  };
}

const ORPHAN = {
  kind: "ORPHAN_CHARGE" as const,
  chargeId: "charge-stolen",
  entryId: null,
  mandateId: "mandate-cloudsync",
  vendorName: null,
  ledgerCents: null,
  networkCents: cents(9500),
  detail: "The network charged 9500 cents and our ledger has no entry for it.",
};

function claimFor(source: ReconciliationRun) {
  return signClaim(
    buildEnvelope({
      claimType: "RECONCILIATION",
      claimedAt: source.ranAt,
      ledgerHead: HEAD,
      subject: subjectOf(source),
    }),
  );
}

describe("the reconciliation attestation", () => {
  let publicKeyB64: string | null = null;

  beforeEach(() => {
    const identity = generateSigningIdentity();
    process.env.RECEIPT_SIGNING_KEY = identity.privateKeyB64;
    resetSigningIdentityCache();
    publicKeyB64 = getPublicIdentity()?.publicKeyB64 ?? null;
  });

  afterEach(() => {
    delete process.env.RECEIPT_SIGNING_KEY;
    resetSigningIdentityCache();
  });

  it("verifies what it actually found", () => {
    expect(verifyClaim({ claim: claimFor(run()), publicKeyB64 })).toBe("VALID");
  });

  it("cannot have a discrepant verdict flipped to balanced", () => {
    const claim = claimFor(run({ status: "DISCREPANT", discrepancies: [ORPHAN] }));
    const flipped = {
      ...claim,
      envelope: {
        ...claim.envelope,
        subject: { ...claim.envelope.subject, status: "BALANCED" as const },
      },
    };

    expect(verifyClaim({ claim: flipped, publicKeyB64 })).toBe("INVALID");
  });

  it("cannot have a named discrepancy quietly removed", () => {
    // The attack this defends against is not editing the ledger — it is editing
    // the document that says the ledger is complete.
    const claim = claimFor(run({ status: "DISCREPANT", discrepancies: [ORPHAN] }));
    const emptied = {
      ...claim,
      envelope: {
        ...claim.envelope,
        subject: { ...claim.envelope.subject, discrepancies: [] },
      },
    };

    expect(verifyClaim({ claim: emptied, publicKeyB64 })).toBe("INVALID");
  });

  it("cannot be re-anchored to a different point in history", () => {
    const claim = claimFor(run());
    const moved = {
      ...claim,
      envelope: { ...claim.envelope, ledgerHead: "a".repeat(64) },
    };

    expect(verifyClaim({ claim: moved, publicKeyB64 })).toBe("BROKEN_LINK");
  });

  it("signs an unverifiable run rather than staying silent", () => {
    // If only clean runs were attested, the existence of an attestation would
    // carry no information at all.
    const unreadable = run({
      status: "UNVERIFIABLE",
      mandatesChecked: 0,
      unreadable: [
        {
          mandateId: "mandate-figma",
          vendorName: "Figma",
          reason: "UNSUPPORTED",
          message: "No charge-history endpoint.",
        },
      ],
    });

    const claim = claimFor(unreadable);
    expect(verifyClaim({ claim, publicKeyB64 })).toBe("VALID");
    expect(claim.envelope.subject.status).toBe("UNVERIFIABLE");
    expect(claim.envelope.subject.unreadable[0].reason).toBe("UNSUPPORTED");
  });

  it("records which provider answered, so a mock run is never dressed as real", () => {
    expect(subjectOf(run({ provider: "mock" })).provider).toBe("mock");
    expect(subjectOf(run({ provider: "prava" })).provider).toBe("prava");
  });

  it("signs the sentence alongside the numbers it describes", () => {
    const source = run({ status: "DISCREPANT", discrepancies: [ORPHAN] });
    expect(subjectOf(source).sentence).toBe(containmentSentence(source));
    expect(subjectOf(source).sentence).toContain("1 discrepancy");
  });

  it("never describes an unverifiable run as a clean bill of health", () => {
    const sentence = containmentSentence(
      run({
        status: "UNVERIFIABLE",
        unreadable: [
          { mandateId: "m", vendorName: null, reason: "UNSUPPORTED", message: "" },
        ],
      }),
    );

    expect(sentence).toContain("could not be");
    expect(sentence).toContain("absence");
    expect(sentence).not.toContain("balance");
  });
});
