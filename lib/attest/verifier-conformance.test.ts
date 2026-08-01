import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  GENESIS_PREV_DIGEST,
  generateSigningIdentity,
  issueReceipt,
  resetSigningIdentityCache,
} from "./index";

/**
 * CONFORMANCE — the signer and the verifier must agree, and only this file
 * proves it.
 *
 * `scripts/verify-receipts.mjs` re-implements canonicalization independently
 * and imports nothing from lib/. That independence is the point: a verifier
 * sharing code with the signer only proves we agree with ourselves.
 *
 * The cost of that independence is drift. Change a rule in ./canonical.ts and
 * forget the verifier, and nothing else in this repository notices — the whole
 * Vitest suite verifies lib/attest against itself and stays green. The first
 * symptom would be the verifier reporting CHAIN COMPROMISED on a genuine,
 * untampered ledger, in front of the person we just handed the file to.
 *
 * So this test does the one thing no other test does: it SPAWNS the real
 * script as a separate process and checks its exit code.
 *
 * The records below are deliberately awkward — unicode that needs NFC, null
 * beside absent, unsorted nested keys, escapes, arrays whose order matters,
 * large integers. Each one targets a specific canonicalization rule, so drift
 * in any single rule fails here rather than on stage.
 */

const VERIFIER = resolve(process.cwd(), "scripts/verify-receipts.mjs");

let dir: string;
let publicKeyB64: string;
let previousKey: string | undefined;

/** Records shaped to exercise every rule in the canonicalization contract. */
const RECORDS: Array<Record<string, unknown>> = [
  {
    id: "entry-plain",
    vendorName: "Figma",
    amountCents: 18000,
    outcome: "EXECUTED",
  },
  {
    id: "entry-unicode",
    // DECOMPOSED on purpose — "e" + combining acute, not the single code point
    // U+00E9. Written as escapes because the difference is invisible in an
    // editor, and a composed literal here would make this record test nothing:
    // NFC would be a no-op and dropping normalization in either implementation
    // would still agree. This is the only record that exercises rule 4.
    vendorName: "Café Systèmes",
    note: 'quotes " and \\ backslash and \n newline and \t tab',
    amountCents: 9007199254740991,
  },
  {
    id: "entry-nulls",
    // null must survive; undefined must vanish. Absence is not emptiness.
    decidedBy: null,
    authorizedBy: null,
    executedBy: null,
    agentRationale: null,
    error: null,
  },
  {
    id: "entry-nested",
    // Keys deliberately out of order at every depth.
    zeta: { yankee: 1, alpha: { zulu: true, bravo: false } },
    alpha: { zulu: [3, 1, 2], bravo: null },
    priceHistory: [
      { cycleStart: "2026-01-01", amountCents: 18000 },
      { cycleStart: "2026-02-01", amountCents: 18000 },
    ],
  },
  {
    id: "entry-authority",
    authorizedBy: {
      policyVersion: 2,
      ruleOrdinal: 0,
      sourceFragment: "Never auto-renew Vercel.",
      approverId: null,
      passkeyAt: null,
    },
    executedBy: {
      provider: "prava",
      mandateId: "mandate_seed_vercel",
      chargeId: null,
      status: "refused",
    },
    clockAt: "2026-03-01T09:00:00.000Z",
    vendorName: "Vercel",
    outcome: "REFUSED",
    amountCents: 0,
  },
];

/** Builds a chained bundle in the same shape lib/ledger/bundle.ts emits. */
function bundleOf(records: Array<Record<string, unknown>>) {
  let prev = GENESIS_PREV_DIGEST;
  const entries = records.map((record) => {
    const receipt = issueReceipt(record, prev);
    prev = receipt.digest;
    return { record, receipt };
  });

  return {
    format: "spend-guardian-receipts",
    formatVersion: 1,
    canonVersion: "sg-canon-1",
    exportedAt: "2026-03-01T09:00:00.000Z",
    key: { algorithm: "ed25519", keyId: "test", publicKeyB64 },
    partial: false,
    entries,
    notice: "test bundle",
  };
}

function writeBundle(name: string, value: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(value, null, 2));
  return path;
}

/** Runs the real script. Returns its exit code rather than throwing. */
function runVerifier(path: string): { code: number; output: string } {
  try {
    const output = execFileSync("node", [VERIFIER, path], {
      encoding: "utf8",
    });
    return { code: 0, output };
  } catch (error) {
    const err = error as { status?: number; stdout?: string; stderr?: string };
    return {
      code: err.status ?? 1,
      output: `${err.stdout ?? ""}${err.stderr ?? ""}`,
    };
  }
}

describe("the standalone verifier agrees with lib/attest", () => {
  beforeAll(() => {
    previousKey = process.env.RECEIPT_SIGNING_KEY;
    const generated = generateSigningIdentity();
    process.env.RECEIPT_SIGNING_KEY = generated.privateKeyB64;
    publicKeyB64 = generated.identity.publicKeyB64;
    resetSigningIdentityCache();
    dir = mkdtempSync(join(tmpdir(), "sg-conformance-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    if (previousKey === undefined) delete process.env.RECEIPT_SIGNING_KEY;
    else process.env.RECEIPT_SIGNING_KEY = previousKey;
    resetSigningIdentityCache();
  });

  it("accepts a bundle this repository signed", () => {
    const path = writeBundle("clean.json", bundleOf(RECORDS));
    const { code, output } = runVerifier(path);

    // If this fails, the two canonicalization implementations have diverged.
    // Fix scripts/verify-receipts.mjs to match lib/attest/canonical.ts — do not
    // "fix" it by making them share code.
    expect(output).toContain("CHAIN INTACT");
    expect(code).toBe(0);
  });

  it("agrees record by record, not just in aggregate", () => {
    // One record per bundle, so a rule that only one record exercises cannot
    // be masked by the others passing.
    for (const record of RECORDS) {
      const path = writeBundle(`single-${record.id}.json`, bundleOf([record]));
      const { code, output } = runVerifier(path);
      expect(output, `record ${record.id}`).toContain("CHAIN INTACT");
      expect(code, `record ${record.id}`).toBe(0);
    }
  });

  it("rejects a record altered after signing", () => {
    const bundle = bundleOf(RECORDS);
    (bundle.entries[0].record as Record<string, unknown>).amountCents = 4800000;

    const { code, output } = runVerifier(writeBundle("altered.json", bundle));
    expect(output).toContain("CHAIN COMPROMISED");
    expect(code).toBe(1);
  });

  it("rejects a removed entry as a chain break", () => {
    const bundle = bundleOf(RECORDS);
    bundle.entries.splice(2, 1);

    const { code, output } = runVerifier(writeBundle("removed.json", bundle));
    expect(output).toContain("chain break");
    expect(code).toBe(1);
  });

  it("rejects a signature from a different key", () => {
    const bundle = bundleOf(RECORDS);
    bundle.key.publicKeyB64 = generateSigningIdentity().identity.publicKeyB64;

    const { code } = runVerifier(writeBundle("wrong-key.json", bundle));
    expect(code).toBe(1);
  });

  it("reports an unsigned entry as unattested rather than invalid", () => {
    const bundle = bundleOf(RECORDS);
    bundle.entries[1].receipt.signature = null;

    const { code, output } = runVerifier(writeBundle("unsigned.json", bundle));
    // Unattested is not a failure. An entry written before receipts existed,
    // or with no key configured, is not a forgery.
    expect(output).toContain("1 unattested");
    expect(code).toBe(0);
  });
});
