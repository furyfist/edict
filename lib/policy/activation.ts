import { db } from "../db/client";
import { buildEnvelope, signClaim, type SignedClaim } from "../attest/claims";
import { ledgerHead } from "../ledger";
import type { Effect, Policy } from "../contracts";
import { currentBundles, previewOf } from "./preview";

/**
 * THE ACTIVATION RECORD — the first claim type in the proof plane.
 *
 * ---------------------------------------------------------------------------
 * THE SENTENCE THIS MAKES TRUE
 *
 * "The human saw what this policy would do before granting it."
 *
 * Until now that sentence could only be narrated. It is the kind of claim that
 * is easy to make, impossible to check, and exactly the kind this product is
 * supposed to refuse to make on trust. So: the preview is hashed, the hash is
 * signed alongside what was granted, and the whole thing is anchored to the
 * ledger head. A stranger can check it with the application switched off.
 *
 * ---------------------------------------------------------------------------
 * WHY THE SERVER RECOMPUTES THE PREVIEW
 *
 * The browser sends the digest of the preview it rendered. Trusting that number
 * would make the record a statement about a value the client chose, which is no
 * better than the narration it replaces. So the server rebuilds the preview from
 * the same books and compares.
 *
 * A mismatch REFUSES the activation. That is the safe direction and it is also
 * the honest one: if the two disagree, either the books moved under the preview
 * or the client sent something it did not render, and in both cases the person
 * is about to consent to something other than what they read.
 * ---------------------------------------------------------------------------
 */

export interface ActivationSubject {
  policyVersionId: string;
  policyVersion: number;
  /** Exactly what the user typed. The claim is about these words. */
  englishText: string;
  ruleCount: number;

  /**
   * SHA-256 of the preview projection the human was shown, or null when the
   * preview could not be computed. Null is a real state and it is rendered as
   * one — never as a preview that happened to be empty.
   */
  previewDigest: string | null;
  batteryVersion: string | null;
  scenarioCount: number | null;
  counts: Record<Effect, number> | null;

  /** Demo clock at activation. */
  activatedAt: string;
}

export type PreviewCheck =
  | { ok: true; digest: string | null; subject: Omit<ActivationSubject, "policyVersionId" | "policyVersion" | "englishText" | "ruleCount" | "activatedAt"> }
  | { ok: false; expected: string | null; received: string | null };

/**
 * Rebuilds the preview and compares it against what the client claims to have
 * seen. `claimed === null` means the client rendered no preview, which is
 * allowed and recorded as such.
 */
export async function checkPreview(
  policy: Policy,
  claimed: string | null,
): Promise<PreviewCheck> {
  let computed: ReturnType<typeof previewOf> | null = null;
  try {
    computed = previewOf(policy, await currentBundles());
  } catch (error) {
    console.error("[activation] preview could not be recomputed:", error);
  }

  const digest = computed?.digest ?? null;

  // Both sides agree there was no preview. Recorded honestly rather than
  // blocked: a policy may be activated without one, it just cannot claim one.
  if (claimed === null && digest === null) {
    return {
      ok: true,
      digest: null,
      subject: {
        previewDigest: null,
        batteryVersion: null,
        scenarioCount: null,
        counts: null,
      },
    };
  }

  if (claimed !== digest) {
    return { ok: false, expected: digest, received: claimed };
  }

  return {
    ok: true,
    digest,
    subject: {
      previewDigest: digest,
      batteryVersion: computed?.preview.batteryVersion ?? null,
      scenarioCount: computed?.preview.scenarioCount ?? null,
      counts: computed?.preview.counts ?? null,
    },
  };
}

/**
 * Signs and persists the activation record.
 *
 * Deliberately called AFTER the version is activated. The claim is that this
 * activation happened and was preceded by this preview — writing it first would
 * mean signing a statement about something that had not occurred yet.
 */
export async function recordActivation(input: {
  policy: Policy;
  check: Extract<PreviewCheck, { ok: true }>;
  clock: Date;
}): Promise<SignedClaim<ActivationSubject>> {
  const subject: ActivationSubject = {
    policyVersionId: input.policy.id,
    policyVersion: input.policy.version,
    englishText: input.policy.englishText,
    ruleCount: input.policy.rules.length,
    ...input.check.subject,
    activatedAt: input.clock.toISOString(),
  };

  const claim = signClaim(
    buildEnvelope({
      claimType: "ACTIVATION",
      claimedAt: input.clock.toISOString(),
      ledgerHead: await ledgerHead(),
      subject,
    }),
  );

  await db.claim.create({
    data: {
      type: "ACTIVATION",
      clockAt: input.clock,
      ledgerHead: claim.envelope.ledgerHead,
      subject: JSON.parse(JSON.stringify(subject)),
      policyVersionId: input.policy.id,
      receiptDigest: claim.receipt.digest,
      receiptPrevDigest: claim.receipt.prevDigest,
      receiptSignature: claim.receipt.signature,
      receiptKeyId: claim.receipt.keyId,
      receiptCanonVersion: claim.receipt.canonVersion,
    },
  });

  return claim;
}

/** The activation record for a version, if one was ever written. */
export async function activationFor(policyVersionId: string) {
  return db.claim.findFirst({
    where: { type: "ACTIVATION", policyVersionId },
    orderBy: { createdAt: "desc" },
  });
}
