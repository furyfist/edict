import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildEnvelope, signClaim, verifyClaim } from "./claims";
import { GENESIS_PREV_DIGEST } from "./index";
import {
  generateSigningIdentity,
  getPublicIdentity,
  resetSigningIdentityCache,
} from "./keys";

/**
 * A claim is only worth signing if breaking it is loud. Every test here is a
 * different way of lying about a claim, and every one of them must fail.
 */

const HEAD = "a".repeat(64);

function subject() {
  return {
    policyVersionId: "policy-1",
    policyVersion: 2,
    previewDigest: "b".repeat(64),
    scenarioCount: 72,
  };
}

function claimOf(overrides: { ledgerHead?: string } = {}) {
  return signClaim(
    buildEnvelope({
      claimType: "ACTIVATION",
      claimedAt: "2026-03-01T09:00:00.000Z",
      ledgerHead: overrides.ledgerHead ?? HEAD,
      subject: subject(),
    }),
  );
}

describe("the claim envelope", () => {
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

  it("verifies a claim it just signed", () => {
    expect(verifyClaim({ claim: claimOf(), publicKeyB64 })).toBe("VALID");
  });

  it("fails when the subject is edited", () => {
    const claim = claimOf();
    const tampered = {
      ...claim,
      envelope: {
        ...claim.envelope,
        subject: { ...claim.envelope.subject, previewDigest: "c".repeat(64) },
      },
    };

    // The whole point of embedding the preview hash: swapping in a different
    // preview after the fact cannot go unnoticed.
    expect(verifyClaim({ claim: tampered, publicKeyB64 })).toBe("INVALID");
  });

  it("fails when the anchor is rewritten in the envelope", () => {
    const claim = claimOf();
    const tampered = {
      ...claim,
      envelope: { ...claim.envelope, ledgerHead: "d".repeat(64) },
    };

    // BROKEN_LINK, not INVALID: re-pointing a claim at a different ledger state
    // is a distinct accusation from editing what it says, and the verifier says
    // which one happened.
    expect(verifyClaim({ claim: tampered, publicKeyB64 })).toBe("BROKEN_LINK");
  });

  it("fails when the anchor is rewritten in the receipt", () => {
    const claim = claimOf();
    const tampered = {
      ...claim,
      receipt: { ...claim.receipt, prevDigest: "e".repeat(64) },
    };
    expect(verifyClaim({ claim: tampered, publicKeyB64 })).toBe("BROKEN_LINK");
  });

  it("anchors inside the signature, so two heads produce two digests", () => {
    // If the head sat outside the signed payload, a claim could be moved to a
    // different point in history and still verify.
    expect(claimOf({ ledgerHead: HEAD }).receipt.digest).not.toBe(
      claimOf({ ledgerHead: "f".repeat(64) }).receipt.digest,
    );
  });

  it("anchors to genesis against an empty ledger — a real anchor, not a missing one", () => {
    const claim = claimOf({ ledgerHead: GENESIS_PREV_DIGEST });
    expect(verifyClaim({ claim, publicKeyB64 })).toBe("VALID");
    expect(claim.envelope.ledgerHead).toBe(GENESIS_PREV_DIGEST);
  });

  it("reports UNATTESTED rather than losing the claim when no key is configured", () => {
    delete process.env.RECEIPT_SIGNING_KEY;
    resetSigningIdentityCache();

    const claim = claimOf();
    expect(claim.receipt.signature).toBeNull();
    // The envelope survives intact — a key problem must never cost us the record.
    expect(claim.envelope.subject.scenarioCount).toBe(72);
    expect(verifyClaim({ claim, publicKeyB64: null })).toBe("UNATTESTED");
  });

  it("fails against the wrong public key", () => {
    const stranger = generateSigningIdentity();
    expect(
      verifyClaim({ claim: claimOf(), publicKeyB64: stranger.identity.publicKeyB64 }),
    ).toBe("INVALID");
  });
});
