/**
 * Generates a receipt signing key.
 *
 *   npm run keygen
 *
 * Prints an Ed25519 private key as base64 PKCS8 for RECEIPT_SIGNING_KEY, plus
 * the public half and its key id for reference. The private key is printed to
 * stdout once and never stored — paste it into .env and into the deployed
 * environment's variables.
 *
 * Losing the key does not lose the ledger. It means receipts issued under it
 * can no longer be produced, and previously exported bundles remain verifiable
 * against the public key they carry.
 */

import { generateSigningIdentity } from "../lib/attest";

const { identity, privateKeyB64 } = generateSigningIdentity();

console.log("");
console.log("Add this to .env (and to the deployed environment):");
console.log("");
console.log(`RECEIPT_SIGNING_KEY="${privateKeyB64}"`);
console.log("");
console.log("Public key (published in every exported bundle):");
console.log(`  keyId     ${identity.keyId}`);
console.log(`  publicKey ${identity.publicKeyB64}`);
console.log("");
