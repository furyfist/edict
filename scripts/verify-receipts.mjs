#!/usr/bin/env node
/**
 * OFFLINE RECEIPT VERIFIER
 *
 *   node scripts/verify-receipts.mjs <bundle.json>
 *   curl -s http://localhost:3000/api/receipts > b.json && node scripts/verify-receipts.mjs b.json
 *
 * Copy this one file and a bundle onto any machine with Node. No npm install,
 * no database, no network, no access to the Edict source.
 *
 * ---------------------------------------------------------------------------
 * THE DUPLICATION BELOW IS DELIBERATE. DO NOT "FIX" IT.
 *
 * `canonicalize` here is a second, independent implementation of the rules
 * documented in lib/attest/canonical.ts. It imports nothing from lib/ on
 * purpose: a verifier that shares code with the signer only proves that we
 * agree with ourselves, which is not what anyone is asking.
 *
 * If you change the canonicalization rules in lib/attest, change them here too.
 * lib/attest/verifier-conformance.test.ts is what tells you that you forgot —
 * it runs this exact file against freshly signed bundles and fails the build
 * when the two implementations disagree. Run `npm run test` after touching
 * either one.
 * ---------------------------------------------------------------------------
 *
 * Exit code 0 when everything verifies, 1 otherwise.
 */

import { createHash, verify as edVerify } from "node:crypto";
import { readFileSync } from "node:fs";

const GENESIS =
  "0000000000000000000000000000000000000000000000000000000000000000";

// -- canonicalization, re-implemented from the documented rules --------------

function esc(s) {
  return JSON.stringify(s.normalize("NFC"));
}

function canonicalize(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return esc(value);
  if (t === "number") {
    if (!Number.isFinite(value)) throw new Error("non-finite number");
    return JSON.stringify(value);
  }
  if (t === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : canonicalize(v))).join(",")}]`;
  }
  if (t === "object") {
    const parts = [];
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      parts.push(`${esc(key)}:${canonicalize(value[key])}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(`unsupported ${t}`);
}

function sha256Hex(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

// -- verification ------------------------------------------------------------

function verifyEntry(item, publicKeyB64, expectedPrev) {
  const { record, receipt } = item;

  if (!receipt || !receipt.digest) return "UNATTESTED";

  if (expectedPrev !== null && receipt.prevDigest !== expectedPrev) {
    return "BROKEN_LINK";
  }

  const payload = {
    canonVersion: receipt.canonVersion,
    prevDigest: receipt.prevDigest,
    record,
  };

  let canonical;
  try {
    canonical = canonicalize(payload);
  } catch {
    return "INVALID";
  }

  if (sha256Hex(canonical) !== receipt.digest) return "INVALID";

  if (!receipt.signature) return "UNATTESTED";
  if (!publicKeyB64) return "UNATTESTED";

  try {
    const ok = edVerify(
      null,
      Buffer.from(canonical, "utf8"),
      {
        key: Buffer.from(publicKeyB64, "base64"),
        format: "der",
        type: "spki",
      },
      Buffer.from(receipt.signature, "base64"),
    );
    return ok ? "VALID" : "INVALID";
  } catch {
    return "INVALID";
  }
}

/**
 * Verifies a CLAIM — a statement about the record, rather than a record of an
 * action.
 *
 * Two differences from an entry, both deliberate:
 *
 *   1. A claim is ANCHORED, not sequenced. It carries the ledger head it was
 *      made against instead of linking to a predecessor, so there is no chain
 *      position to check — only that the anchor inside the signature matches the
 *      anchor the envelope displays.
 *
 *   2. The signed payload is the envelope itself, not a `record` field.
 *
 * The anchor check is what stops `ledgerHead` being a decorative field. Without
 * it, an attestation saying "the books balanced" could be re-pointed at any
 * moment in history and would still verify.
 */
function verifyClaim(item, publicKeyB64) {
  const { envelope, receipt } = item;

  if (!receipt || !receipt.digest) return "UNATTESTED";
  if (!envelope) return "INVALID";

  if (receipt.prevDigest !== envelope.ledgerHead) return "BROKEN_LINK";

  const payload = {
    canonVersion: receipt.canonVersion,
    prevDigest: receipt.prevDigest,
    record: envelope,
  };

  let canonical;
  try {
    canonical = canonicalize(payload);
  } catch {
    return "INVALID";
  }

  if (sha256Hex(canonical) !== receipt.digest) return "INVALID";

  if (!receipt.signature) return "UNATTESTED";
  if (!publicKeyB64) return "UNATTESTED";

  try {
    const ok = edVerify(
      null,
      Buffer.from(canonical, "utf8"),
      {
        key: Buffer.from(publicKeyB64, "base64"),
        format: "der",
        type: "spki",
      },
      Buffer.from(receipt.signature, "base64"),
    );
    return ok ? "VALID" : "INVALID";
  } catch {
    return "INVALID";
  }
}

// -- reporting ---------------------------------------------------------------

const MARK = {
  VALID: "  ok  ",
  INVALID: " FAIL ",
  BROKEN_LINK: " BREAK",
  UNATTESTED: " none ",
};

function day(value) {
  return typeof value === "string" ? value.slice(0, 10) : "??????????";
}

function text(value, width) {
  return String(value ?? "-").padEnd(width);
}

function money(cents) {
  if (typeof cents !== "number") return "-";
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function describeAuthority(record) {
  const lines = [];
  const a = record.authorizedBy;

  if (a) {
    lines.push(`      authorised by  policy v${a.policyVersion}, rule ordinal ${a.ruleOrdinal}`);
    lines.push(`      the sentence   "${a.sourceFragment}"`);
    if (a.approverId) {
      lines.push(
        `      approved by    ${a.approverId}` +
          (a.passkeyAt ? ` with a passkey at ${a.passkeyAt}` : " in-app (no new authority)"),
      );
    }
  } else {
    lines.push("      authorised by  nothing — no rule was cited");
  }

  const d = record.decidedBy;
  if (d) {
    lines.push(`      decided by     ${d.modelId}${d.stubbed ? " (deterministic fallback)" : ""}`);
  }

  const e = record.executedBy;
  lines.push(
    e
      ? `      executed by    ${e.provider} mandate ${e.mandateId}, charge ${e.chargeId ?? "none"}`
      : "      executed by    nobody — no money moved",
  );

  return lines;
}

// -- main --------------------------------------------------------------------

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/verify-receipts.mjs <bundle.json>");
  process.exit(2);
}

let bundle;
try {
  bundle = JSON.parse(readFileSync(path, "utf8"));
} catch (error) {
  console.error(`could not read ${path}: ${error.message}`);
  process.exit(2);
}

if (bundle.format !== "edict-receipts") {
  console.error(`not an Edict receipt bundle (format: ${bundle.format})`);
  process.exit(2);
}

if (!Array.isArray(bundle.entries)) {
  console.error("malformed bundle: `entries` is missing or is not a list");
  process.exit(2);
}

const publicKeyB64 = bundle.key ? bundle.key.publicKeyB64 : null;

console.log("");
console.log("Edict — offline receipt verification");
console.log(`  bundle      ${path}`);
console.log(`  exported    ${bundle.exportedAt}`);
console.log(`  canon       ${bundle.canonVersion}`);
console.log(
  `  key         ${bundle.key ? `${bundle.key.algorithm} ${bundle.key.keyId}` : "none — bundle is unattested"}`,
);
console.log(`  entries     ${bundle.entries.length}${bundle.partial ? " (partial — a slice, not the whole ledger)" : ""}`);
console.log("");

// A partial bundle cannot prove nothing was removed before its first entry, so
// its first link is not checked against genesis. Say so rather than implying a
// guarantee we do not have.
let expectedPrev = bundle.partial ? null : GENESIS;
const tally = { VALID: 0, INVALID: 0, BROKEN_LINK: 0, UNATTESTED: 0 };

for (const item of bundle.entries) {
  const status = verifyEntry(item, publicKeyB64, expectedPrev);
  tally[status] += 1;

  const r = item.record;

  // Display fields are read defensively. A verifier's job is to return a
  // verdict on whatever it is handed, including a file someone has just
  // hand-edited in front of us — crashing on a missing field would turn a
  // successful detection into a stack trace at the worst possible moment.
  // None of this affects the verdict: `verifyEntry` above reads the canonical
  // payload, not these.
  console.log(
    `[${MARK[status]}] ${day(r.clockAt)}  ${text(r.vendorName, 14)} ` +
      `${text(r.outcome, 10)} ${money(r.amountCents).padStart(12)}`,
  );

  if (status === "VALID") {
    for (const line of describeAuthority(r)) console.log(line);
  } else if (status === "INVALID") {
    console.log("      !! this record does not match its signature — it was altered after it was written");
  } else if (status === "BROKEN_LINK") {
    console.log(`      !! chain break — expected previous digest ${expectedPrev}`);
    console.log(`         but this entry links to            ${item.receipt.prevDigest}`);
    console.log("         an entry was removed, reordered, or inserted");
  } else {
    console.log("      -- no signature. Written before receipts existed, or with no key configured.");
  }

  console.log("");

  // Continue from what this entry actually claims, so one break does not
  // cascade into every later entry reporting the same failure twice.
  expectedPrev = item.receipt ? item.receipt.digest : expectedPrev;
}

// -- claims ------------------------------------------------------------------
//
// Statements the system makes ABOUT the record: what a human was shown before
// granting authority, and whether the books balance against the payment
// network's own book.

const claims = Array.isArray(bundle.claims) ? bundle.claims : [];
const claimTally = { VALID: 0, INVALID: 0, BROKEN_LINK: 0, UNATTESTED: 0 };

if (claims.length > 0) {
  console.log("claims about this record");
  console.log("");

  for (const item of claims) {
    const status = verifyClaim(item, publicKeyB64);
    claimTally[status] += 1;

    const e = item.envelope ?? {};
    const s = e.subject ?? {};

    console.log(
      `[${MARK[status]}] ${day(e.claimedAt)}  ${text(e.claimType, 16)} ` +
        `anchored to ${String(e.ledgerHead ?? "-").slice(0, 16)}…`,
    );

    // Read defensively, exactly as entries are. The verdict above never depends
    // on any of this.
    if (e.claimType === "ACTIVATION") {
      console.log(
        `      policy v${s.policyVersion} — ${s.previewDigest ? `preview ${String(s.previewDigest).slice(0, 16)}… over ${s.scenarioCount} scenarios` : "NO PREVIEW was shown"}`,
      );
    } else if (e.claimType === "RECONCILIATION") {
      console.log(`      ${text(s.status, 12)} via ${s.provider ?? "?"} — ${s.sentence ?? ""}`);
      for (const d of Array.isArray(s.discrepancies) ? s.discrepancies : []) {
        // The identifier, always. A reader holding this file offline should be
        // able to walk into the payment provider's own dashboard and look the
        // charge up — "one discrepancy" is not something anyone can act on.
        const ref = d.chargeId ?? d.entryId ?? d.mandateId ?? "unidentified";
        console.log(`        !! ${d.kind} [${ref}]: ${d.detail}`);
      }
      for (const u of Array.isArray(s.unreadable) ? s.unreadable : []) {
        console.log(`        ?? ${u.vendorName ?? u.mandateId}: ${u.reason} — ${u.message}`);
      }
    } else if (e.claimType === "ADVERSARIAL") {
      console.log(
        `      corpus ${s.corpusVersion} @ ${String(s.corpusDigest ?? "").slice(0, 16)}…`,
      );
      console.log(
        `      ${s.attempted} attempted · ${s.defended} defended · ${s.breached} breached · ` +
          `${s.centsMovedOutsideAuthority} cents moved outside authority`,
      );

      // The headline is inside the signature, so it is printed as signed rather
      // than re-derived here. If it overclaims, it overclaims verifiably.
      if (s.headline) console.log(`      "${s.headline}"`);

      for (const t of Array.isArray(s.byClass) ? s.byClass : []) {
        if (t.attempted === 0 && t.skipped === 0) continue;
        console.log(
          `        ${String(t.class).padEnd(22)} ${t.defended}/${t.attempted} defended` +
            (t.breached > 0 ? `  !! ${t.breached} BREACHED` : "") +
            (t.skipped > 0 ? `  (${t.skipped} not run)` : ""),
        );
      }

      // Name every breach individually. A summary line that said "2 breached"
      // without saying which would be the one place this file hid something.
      for (const r of Array.isArray(s.results) ? s.results : []) {
        if (r.verdict !== "BREACHED") continue;
        console.log(
          `        !! ${r.attackId} against ${r.vendorName ?? "?"}: ` +
            `${r.outcome}${r.refusalCode ? "/" + r.refusalCode : ""}, ${r.chargedCents} cents`,
        );
      }

      const c = s.completeness ?? {};
      console.log(
        c.unproven
          ? `      completeness: NOT PROVEN at this head — the "zero moved money" claim is not supported`
          : `      completeness: proven ${c.status} against attestation ${String(c.attestationDigest ?? "").slice(0, 16)}…`,
      );
    }

    if (status === "INVALID") {
      console.log("      !! this claim does not match its signature — it was altered after it was made");
    } else if (status === "BROKEN_LINK") {
      console.log(`      !! anchor mismatch — the envelope says ${e.ledgerHead}`);
      console.log(`         but the signature covers  ${item.receipt.prevDigest}`);
      console.log("         this claim was moved to a different point in history");
    } else if (status === "UNATTESTED") {
      console.log("      -- no signature. Made with no key configured.");
    }

    console.log("");
  }
}

const failed =
  tally.INVALID + tally.BROKEN_LINK + claimTally.INVALID + claimTally.BROKEN_LINK;

console.log("---");
console.log(
  `  ${tally.VALID} verified · ${tally.INVALID} altered · ${tally.BROKEN_LINK} chain breaks · ${tally.UNATTESTED} unattested`,
);
if (claims.length > 0) {
  console.log(
    `  ${claimTally.VALID} claims verified · ${claimTally.INVALID} altered · ${claimTally.BROKEN_LINK} re-anchored · ${claimTally.UNATTESTED} unattested`,
  );
}
console.log("");
console.log(
  failed === 0
    ? "  CHAIN INTACT. Every signed entry matches its signature and its position, and every claim about them holds."
    : "  CHAIN COMPROMISED. This ledger has been modified since it was written.",
);
console.log("");
console.log(`  ${bundle.notice}`);
console.log("");

process.exit(failed === 0 ? 0 : 1);
