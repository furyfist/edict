/**
 * CANONICAL SERIALIZATION — one byte representation per logical record.
 *
 * Every signature in this system is only as trustworthy as the guarantee that a
 * record serializes exactly one way. If the same logical entry can produce two
 * different byte strings, every signature becomes a coin flip and the failures
 * look like key problems rather than serialization problems.
 *
 * This module is pure. No I/O, no clock, no randomness, no database. It imports
 * nothing but Node's crypto — the same isolation property lib/policy/engine has,
 * and for the same reason.
 *
 * ---------------------------------------------------------------------------
 * THE RULES — normative, and re-implemented by scripts/verify-receipts.mjs
 *
 * The standalone verifier deliberately does NOT import this file. It
 * re-implements the rules below from this description, because a verifier that
 * shares code with the signer only proves we agree with ourselves. If you
 * change anything here you must change it there.
 *
 * `verifier-conformance.test.ts` is what tells you that you forgot: it spawns
 * the real script as a separate process and checks its exit code. Nothing else
 * does — every other test in this repository verifies lib/attest against
 * itself and would stay green while the two implementations drifted apart.
 *
 *   1. Objects       keys sorted ascending by UTF-16 code unit (default sort),
 *                    serialized as {"k":v,...} with no whitespace.
 *   2. undefined     a key whose value is undefined is OMITTED entirely.
 *                    A key whose value is null is KEPT as null. Absence and
 *                    emptiness are different facts — the same rule the evidence
 *                    bundle already lives by.
 *   3. Arrays        order preserved, never sorted. Order is data here
 *                    (rule ordinals, price history, seat detail).
 *   4. Strings       Unicode NFC, then JSON string escaping.
 *   5. Numbers       must be finite. NaN and Infinity throw rather than
 *                    silently becoming null the way JSON.stringify does.
 *   6. Booleans      literal true / false.
 *   7. Dates         rejected. Callers must pass ISO-8601 strings, so that the
 *                    thing signed is the thing a reader reconstructs.
 *   8. Output        UTF-8 bytes of the produced string.
 * ---------------------------------------------------------------------------
 */

import { createHash } from "node:crypto";

/**
 * Bumped whenever the rules above change. Stored on every receipt so that a
 * receipt signed under an older scheme can still be identified rather than
 * silently failing verification.
 */
export const CANON_VERSION = "sg-canon-1";

function escapeString(value: string): string {
  // NFC first: two visually identical strings with different code point
  // sequences must not produce different signatures.
  return JSON.stringify(value.normalize("NFC"));
}

function encode(value: unknown, path: string): string {
  if (value === null) return "null";

  const type = typeof value;

  if (type === "string") return escapeString(value as string);

  if (type === "number") {
    const n = value as number;
    if (!Number.isFinite(n)) {
      throw new Error(
        `canonicalize: non-finite number at ${path}. Money is integer cents and ` +
          `every other numeric field is a count or a percentage — a NaN here is a ` +
          `bug upstream, not something to serialize.`,
      );
    }
    return JSON.stringify(n);
  }

  if (type === "boolean") return (value as boolean) ? "true" : "false";

  if (value instanceof Date) {
    throw new Error(
      `canonicalize: Date at ${path}. Pass ISO-8601 strings — the signed shape ` +
        `must be the shape the read path reconstructs, and the read path returns ` +
        `strings.`,
    );
  }

  if (Array.isArray(value)) {
    // Order is preserved. Never sort: ordinals and history are ordered data.
    const items = value.map((item, i) =>
      // `undefined` inside an array cannot be omitted without shifting every
      // later index, so it becomes null — matching JSON.stringify.
      item === undefined ? "null" : encode(item, `${path}[${i}]`),
    );
    return `[${items.join(",")}]`;
  }

  if (type === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const parts: string[] = [];

    for (const key of keys) {
      const child = record[key];
      // Rule 2: undefined is absent, null is present.
      if (child === undefined) continue;
      parts.push(`${escapeString(key)}:${encode(child, `${path}.${key}`)}`);
    }

    return `{${parts.join(",")}}`;
  }

  throw new Error(`canonicalize: unsupported ${type} at ${path}`);
}

/** The canonical string form. Deterministic for any supported value. */
export function canonicalize(value: unknown): string {
  return encode(value, "$");
}

/** SHA-256 of the canonical form, lowercase hex. */
export function digestOf(value: unknown): string {
  return createHash("sha256").update(canonicalize(value), "utf8").digest("hex");
}
