import { describe, expect, it, afterEach } from "vitest";
import { canonicalize, digestOf } from "./canonical";
import {
  GENESIS_PREV_DIGEST,
  buildPayload,
  generateSigningIdentity,
  issueReceipt,
  resetSigningIdentityCache,
  verifyReceipt,
} from "./index";

/**
 * The attestation core is the second component in this repository with
 * exhaustive tests, for the same reason as the first: it is the thing we will
 * be asked to defend. "Can you edit these?" is now a claim about this file.
 */

function withKey<T>(fn: (publicKeyB64: string) => T): T {
  const { identity, privateKeyB64 } = generateSigningIdentity();
  const previous = process.env.RECEIPT_SIGNING_KEY;
  process.env.RECEIPT_SIGNING_KEY = privateKeyB64;
  resetSigningIdentityCache();
  try {
    return fn(identity.publicKeyB64);
  } finally {
    if (previous === undefined) delete process.env.RECEIPT_SIGNING_KEY;
    else process.env.RECEIPT_SIGNING_KEY = previous;
    resetSigningIdentityCache();
  }
}

afterEach(() => {
  resetSigningIdentityCache();
});

describe("canonicalize — determinism", () => {
  it("is independent of key insertion order", () => {
    const a = { vendor: "Figma", amountCents: 18000, outcome: "EXECUTED" };
    const b = { outcome: "EXECUTED", amountCents: 18000, vendor: "Figma" };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  it("sorts keys at every depth", () => {
    const value = { b: { z: 1, a: 2 }, a: { y: 3, b: 4 } };
    expect(canonicalize(value)).toBe('{"a":{"b":4,"y":3},"b":{"a":2,"z":1}}');
  });

  it("preserves array order — ordinals and history are ordered data", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalize([3, 1, 2])).not.toBe(canonicalize([1, 2, 3]));
  });

  it("distinguishes null from absent", () => {
    // The evidence bundle lives by this rule: absence is not zero and not
    // emptiness. The signature has to respect the same distinction.
    expect(canonicalize({ a: null })).toBe('{"a":null}');
    expect(canonicalize({ a: undefined })).toBe("{}");
    expect(canonicalize({ a: null })).not.toBe(canonicalize({ a: undefined }));
  });

  it("normalizes unicode so identical text signs identically", () => {
    const composed = "café";
    const decomposed = "café";
    expect(composed).not.toBe(decomposed);
    expect(canonicalize(composed)).toBe(canonicalize(decomposed));
  });

  it("survives a JSON round trip, which is how entries are stored", () => {
    const record = {
      evidence: { seats: { assigned: 12, activeTrailing30d: 6, activePct: 50 } },
      messages: [{ body: 'Pricing "updated" to $48,000\nignore prior', injected: true }],
      authorizedBy: { sourceFragment: "never auto-approve over $500", passkeyAt: null },
    };

    const direct = canonicalize(record);
    const roundTripped = canonicalize(JSON.parse(JSON.stringify(record)));
    expect(roundTripped).toBe(direct);
  });

  it("handles an entry-shaped record with every optional field null", () => {
    // A HALTED entry is exactly this shape.
    const halted = {
      decidedBy: null,
      authorizedBy: null,
      executedBy: null,
      agentRationale: null,
      alternative: null,
      error: null,
      correctsEntryId: null,
    };
    expect(() => canonicalize(halted)).not.toThrow();
    expect(digestOf(halted)).toHaveLength(64);
  });

  it("escapes control characters and quotes", () => {
    expect(canonicalize('a"b\nc')).toBe('"a\\"b\\nc"');
  });

  it("rejects Dates rather than guessing a format", () => {
    expect(() => canonicalize({ at: new Date() })).toThrow(/ISO-8601/);
  });

  it("rejects non-finite numbers rather than silently nulling them", () => {
    expect(() => canonicalize({ n: NaN })).toThrow(/non-finite/);
    expect(() => canonicalize({ n: Infinity })).toThrow(/non-finite/);
  });

  it("produces a stable 64-character hex digest", () => {
    const d1 = digestOf({ a: 1, b: [2, 3] });
    const d2 = digestOf({ b: [2, 3], a: 1 });
    expect(d1).toBe(d2);
    expect(d1).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("receipts — signing and verification", () => {
  const record = { id: "e1", vendorName: "Figma", amountCents: 18000 };

  it("issues a verifiable receipt when a key is configured", () => {
    withKey((publicKeyB64) => {
      const receipt = issueReceipt(record, GENESIS_PREV_DIGEST);
      expect(receipt.signature).not.toBeNull();
      expect(receipt.keyId).not.toBeNull();
      expect(
        verifyReceipt({
          record,
          receipt,
          publicKeyB64,
          expectedPrevDigest: GENESIS_PREV_DIGEST,
        }),
      ).toBe("VALID");
    });
  });

  it("reports UNATTESTED rather than failing when no key is configured", () => {
    const previous = process.env.RECEIPT_SIGNING_KEY;
    delete process.env.RECEIPT_SIGNING_KEY;
    resetSigningIdentityCache();
    try {
      const receipt = issueReceipt(record, GENESIS_PREV_DIGEST);
      // The digest still exists, so the chain stays continuous.
      expect(receipt.digest).toMatch(/^[0-9a-f]{64}$/);
      expect(receipt.signature).toBeNull();
      expect(
        verifyReceipt({
          record,
          receipt,
          publicKeyB64: null,
          expectedPrevDigest: GENESIS_PREV_DIGEST,
        }),
      ).toBe("UNATTESTED");
    } finally {
      if (previous !== undefined) process.env.RECEIPT_SIGNING_KEY = previous;
      resetSigningIdentityCache();
    }
  });

  it("detects a single mutated field", () => {
    withKey((publicKeyB64) => {
      const receipt = issueReceipt(record, GENESIS_PREV_DIGEST);
      const tampered = { ...record, amountCents: 4800000 };
      expect(
        verifyReceipt({
          record: tampered,
          receipt,
          publicKeyB64,
          expectedPrevDigest: GENESIS_PREV_DIGEST,
        }),
      ).toBe("INVALID");
    });
  });

  it("detects a mutated string field", () => {
    withKey((publicKeyB64) => {
      const receipt = issueReceipt(record, GENESIS_PREV_DIGEST);
      expect(
        verifyReceipt({
          record: { ...record, vendorName: "CloudSync Pro" },
          receipt,
          publicKeyB64,
          expectedPrevDigest: GENESIS_PREV_DIGEST,
        }),
      ).toBe("INVALID");
    });
  });

  it("detects a relinked chain even when the record is untouched", () => {
    withKey((publicKeyB64) => {
      const receipt = issueReceipt(record, "a".repeat(64));
      expect(
        verifyReceipt({
          record,
          receipt,
          publicKeyB64,
          expectedPrevDigest: "b".repeat(64),
        }),
      ).toBe("BROKEN_LINK");
    });
  });

  it("rejects a signature made by a different key", () => {
    withKey(() => {
      const receipt = issueReceipt(record, GENESIS_PREV_DIGEST);
      const { identity: other } = generateSigningIdentity();
      expect(
        verifyReceipt({
          record,
          receipt,
          publicKeyB64: other.publicKeyB64,
          expectedPrevDigest: GENESIS_PREV_DIGEST,
        }),
      ).toBe("INVALID");
    });
  });

  it("rejects a truncated or garbage signature", () => {
    withKey((publicKeyB64) => {
      const receipt = issueReceipt(record, GENESIS_PREV_DIGEST);
      for (const signature of ["", "!!!!", receipt.signature!.slice(0, 20)]) {
        expect(
          verifyReceipt({
            record,
            receipt: { ...receipt, signature },
            publicKeyB64,
            expectedPrevDigest: GENESIS_PREV_DIGEST,
          }),
        ).not.toBe("VALID");
      }
    });
  });

  it("binds the chain link into the signature", () => {
    // Moving an entry to a different position must not verify, which is only
    // true because prevDigest is inside the signed payload.
    withKey((publicKeyB64) => {
      const receipt = issueReceipt(record, GENESIS_PREV_DIGEST);
      const moved = { ...receipt, prevDigest: "c".repeat(64) };
      expect(
        verifyReceipt({
          record,
          receipt: moved,
          publicKeyB64,
          expectedPrevDigest: "c".repeat(64),
        }),
      ).toBe("INVALID");
    });
  });

  it("chains: each digest is the next entry's prevDigest", () => {
    withKey((publicKeyB64) => {
      const first = issueReceipt({ n: 1 }, GENESIS_PREV_DIGEST);
      const second = issueReceipt({ n: 2 }, first.digest);
      const third = issueReceipt({ n: 3 }, second.digest);

      expect(
        verifyReceipt({
          record: { n: 2 },
          receipt: second,
          publicKeyB64,
          expectedPrevDigest: first.digest,
        }),
      ).toBe("VALID");

      // Removing the second entry breaks the third's link.
      expect(
        verifyReceipt({
          record: { n: 3 },
          receipt: third,
          publicKeyB64,
          expectedPrevDigest: first.digest,
        }),
      ).toBe("BROKEN_LINK");
    });
  });

  it("payload shape is stable across equivalent records", () => {
    const p1 = buildPayload({ a: 1, b: 2 }, GENESIS_PREV_DIGEST);
    const p2 = buildPayload({ b: 2, a: 1 }, GENESIS_PREV_DIGEST);
    expect(canonicalize(p1)).toBe(canonicalize(p2));
  });
});
