import { ATTACK_CLASSES } from "../adversary";
import type { AttackClass } from "../adversary";
import type { AttackResult, GauntletRun } from "./types";

/**
 * AGGREGATION — turning a list of attacks into the sentence that goes on stage.
 *
 * Pure. The numbers are counted from the results; nothing here decides whether
 * a defence held, because that judgement was already made against the signed
 * ledger entry each attack produced.
 */

export interface ClassTally {
  class: AttackClass;
  attempted: number;
  defended: number;
  breached: number;
  /** Staged nowhere in this environment, or never reached. */
  skipped: number;
}

export interface CompletenessAnchor {
  /** Digest of the reconciliation attestation this record stands on. */
  attestationDigest: string | null;
  status: "BALANCED" | "DISCREPANT" | "UNVERIFIABLE" | null;
  /** The ledger head that attestation was made against. */
  ledgerHead: string | null;
  /**
   * True when this record's headline cannot be supported.
   *
   * See below — the whole reason this field exists.
   */
  unproven: boolean;
}

export interface AdversarialSummary {
  corpusVersion: string;
  corpusDigest: string;
  startedAt: string;
  finishedAt: string;

  attempted: number;
  defended: number;
  breached: number;
  notApplicable: number;
  notAttempted: number;

  /**
   * Cents that moved outside what the corpus sanctioned.
   *
   * The headline number. Counted from `financialImpact.chargedCents` on the
   * signed entries themselves, so anyone holding the bundle can re-add it.
   */
  centsMovedOutsideAuthority: number;

  byClass: ClassTally[];
  results: AttackResult[];
  completeness: CompletenessAnchor;
  headline: string;
}

export function tallyByClass(results: AttackResult[]): ClassTally[] {
  return ATTACK_CLASSES.map((cls) => {
    const forClass = results.filter((r) => r.class === cls);
    return {
      class: cls,
      attempted: forClass.filter(
        (r) => r.verdict === "DEFENDED" || r.verdict === "BREACHED",
      ).length,
      defended: forClass.filter((r) => r.verdict === "DEFENDED").length,
      breached: forClass.filter((r) => r.verdict === "BREACHED").length,
      skipped: forClass.filter(
        (r) => r.verdict === "NOT_APPLICABLE" || r.verdict === "NOT_ATTEMPTED",
      ).length,
    };
  }).filter((tally) => tally.attempted + tally.skipped > 0);
}

/**
 * THE HEADLINE, AND THE DEPENDENCY IT CANNOT ESCAPE.
 *
 * ---------------------------------------------------------------------------
 * "N attacks, zero unauthorized charges" IS ONLY SOUND IF THE BOOKS ARE COMPLETE.
 *
 * The gauntlet counts money that moved by reading ledger entries. An attacker
 * whose entire strategy is to move money WITHOUT writing an entry defeats that
 * count completely — and the honest version of the sentence collapses to "zero
 * unauthorized charges *that we recorded*", which is worth nothing.
 *
 * So the record stands on the reconciliation attestation. When the books are
 * proven complete, the strong sentence is available. When they are not — no
 * attestation, a stale one, a discrepant one, or one that could not read the
 * provider's book at all — the headline says so instead of quietly keeping the
 * strong wording.
 *
 * This is the M2-before-M3 dependency made structural rather than narrated. It
 * is also the sentence most likely to be quoted, which is exactly why it must
 * degrade honestly on its own.
 * ---------------------------------------------------------------------------
 */
export function headlineFor(input: {
  attempted: number;
  breached: number;
  centsMovedOutsideAuthority: number;
  completeness: CompletenessAnchor;
}): string {
  const { attempted, breached, centsMovedOutsideAuthority, completeness } = input;

  if (breached > 0 || centsMovedOutsideAuthority > 0) {
    return (
      `${breached} of ${attempted} attacks achieved something the corpus did not ` +
      `sanction, moving ${centsMovedOutsideAuthority} cents. Each is named in this record.`
    );
  }

  if (completeness.unproven) {
    return (
      `${attempted} attacks ran and none produced a charge in this ledger. ` +
      `The stronger claim — that none moved money at all — is NOT supported here: ` +
      `it depends on the books being provably complete, and ${completenessGap(completeness)}. ` +
      `This record reports what the ledger contains, not what the world contains.`
    );
  }

  return (
    `${attempted} attacks ran and zero moved money outside authority. ` +
    `The ledger was proven complete against the payment network's own book at the ` +
    `same head this record is anchored to, so "zero recorded" and "zero" are the ` +
    `same number.`
  );
}

function completenessGap(completeness: CompletenessAnchor): string {
  if (completeness.attestationDigest === null) {
    return "no reconciliation has been run";
  }
  if (completeness.status === "UNVERIFIABLE") {
    return "the last reconciliation could not read the provider's charge history";
  }
  if (completeness.status === "DISCREPANT") {
    return "the last reconciliation found the books did not balance";
  }
  return "the last reconciliation was made against an earlier state of the ledger";
}

export function summarize(input: {
  run: GauntletRun;
  corpusDigest: string;
  completeness: CompletenessAnchor;
}): AdversarialSummary {
  const { run, corpusDigest, completeness } = input;
  const results = run.results;

  const attempted = results.filter(
    (r) => r.verdict === "DEFENDED" || r.verdict === "BREACHED",
  ).length;
  const breached = results.filter((r) => r.verdict === "BREACHED").length;

  // Money that moved on an attack the corpus did not sanction. An attack whose
  // expectation INCLUDES execution is a staged charge, not a breach, and its
  // cents are not counted here.
  const centsMovedOutsideAuthority = results
    .filter((r) => r.verdict === "BREACHED")
    .reduce((total, r) => total + r.chargedCents, 0);

  return {
    corpusVersion: run.corpusVersion,
    corpusDigest,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,

    attempted,
    defended: results.filter((r) => r.verdict === "DEFENDED").length,
    breached,
    notApplicable: results.filter((r) => r.verdict === "NOT_APPLICABLE").length,
    notAttempted: results.filter((r) => r.verdict === "NOT_ATTEMPTED").length,

    centsMovedOutsideAuthority,
    byClass: tallyByClass(results),
    results,
    completeness,
    headline: headlineFor({
      attempted,
      breached,
      centsMovedOutsideAuthority,
      completeness,
    }),
  };
}
