/**
 * Receipt signing keys.
 *
 * One Ed25519 key, loaded from the environment, held server-side only. Key
 * material never reaches the browser and never appears in a response body, a
 * ledger entry, or an exported bundle — the same rule §11 already applies to
 * Prava credentials.
 *
 * ---------------------------------------------------------------------------
 * THE FALLBACK, AND WHY IT IS NOT AN ERROR
 *
 * When no key is configured, entries are still written — unsigned, and flagged
 * as unattested everywhere they are shown. Signing must NEVER be able to
 * prevent a ledger write: `appendEntry` runs after a charge may already have
 * succeeded, and money that moved must never be invisible.
 *
 * This mirrors the discipline already in the repository. No OPENAI_API_KEY
 * means the stub agent takes over; no PRAVA_SECRET_KEY means the mock adapter
 * does. A missing signing key degrades the same way: visibly, never silently.
 * ---------------------------------------------------------------------------
 *
 * SCOPE, STATED PLAINLY: one key, no rotation, no HSM, no external anchor. A
 * signature proves the holder of this key wrote this record and that it has not
 * been altered since. It does not prove the record was true when written, and
 * the keyholder could rewrite the whole chain and re-sign it. See
 * docs/disclosure.md.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";

export interface SigningIdentity {
  privateKey: KeyObject;
  publicKey: KeyObject;
  /** Base64 SPKI DER. Safe to publish — this is the whole point. */
  publicKeyB64: string;
  /** First 16 hex of SHA-256 over the SPKI DER. Lets a future key rotate. */
  keyId: string;
  algorithm: "ed25519";
}

export interface PublicIdentity {
  publicKeyB64: string;
  keyId: string;
  algorithm: "ed25519";
}

const ENV_VAR = "RECEIPT_SIGNING_KEY";

let cached: SigningIdentity | null | undefined;

function identityFrom(privateKey: KeyObject): SigningIdentity {
  const publicKey = createPublicKey(privateKey);
  const der = publicKey.export({ format: "der", type: "spki" }) as Buffer;

  return {
    privateKey,
    publicKey,
    publicKeyB64: der.toString("base64"),
    keyId: createHash("sha256").update(der).digest("hex").slice(0, 16),
    algorithm: "ed25519",
  };
}

/**
 * The configured signing identity, or null when none is set.
 *
 * Never throws on a missing key. Throws only on a key that is present and
 * malformed, because that is a misconfiguration a human must see rather than a
 * degraded mode to run in.
 */
export function getSigningIdentity(): SigningIdentity | null {
  if (cached !== undefined) return cached;

  const raw = process.env[ENV_VAR]?.trim();
  if (!raw) {
    cached = null;
    return cached;
  }

  try {
    const key = createPrivateKey({
      key: Buffer.from(raw, "base64"),
      format: "der",
      type: "pkcs8",
    });

    if (key.asymmetricKeyType !== "ed25519") {
      throw new Error(`expected ed25519, got ${key.asymmetricKeyType}`);
    }

    cached = identityFrom(key);
    return cached;
  } catch (cause) {
    throw new Error(
      `${ENV_VAR} is set but could not be read as a base64 PKCS8 Ed25519 key. ` +
        `Generate one with \`npm run keygen\`. Cause: ${(cause as Error).message}`,
    );
  }
}

/** The publishable half, or null when unconfigured. */
export function getPublicIdentity(): PublicIdentity | null {
  const identity = getSigningIdentity();
  if (!identity) return null;
  return {
    publicKeyB64: identity.publicKeyB64,
    keyId: identity.keyId,
    algorithm: identity.algorithm,
  };
}

/** Test seam. Also used by the keygen script. */
export function generateSigningIdentity(): {
  identity: SigningIdentity;
  privateKeyB64: string;
} {
  const { privateKey } = generateKeyPairSync("ed25519");
  const der = privateKey.export({ format: "der", type: "pkcs8" }) as Buffer;
  return {
    identity: identityFrom(privateKey),
    privateKeyB64: der.toString("base64"),
  };
}

/** Clears the module cache. Tests only. */
export function resetSigningIdentityCache(): void {
  cached = undefined;
}
