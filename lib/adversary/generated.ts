import type { AttackEntry } from "./corpus";

/**
 * GENERATED ATTACKS, FROZEN.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE IS WRITTEN BY A SCRIPT AND REVIEWED BY A HUMAN.
 *
 *   npm run attacks:generate
 *
 * A model proposes attacks; `lib/adversary/generate.ts` validates and rebuilds
 * each one from scratch; the script writes the survivors here and bumps
 * `CORPUS_VERSION`. Only then can the gauntlet run them.
 *
 * Committing them as source rather than storing them in a database is the
 * point. A generated corpus in git is diffable, reviewable, and travels with
 * the repository — so "the attacker got smarter last night" is a pull request
 * somebody can read, not an opaque row somewhere.
 *
 * ---------------------------------------------------------------------------
 * WHY FREEZING IS WHAT MAKES A NONDETERMINISTIC GENERATOR USABLE
 *
 * A model that invents attacks at run time would make every gauntlet run
 * incomparable to the last, and a signed record citing "corpus-2" would mean
 * nothing. Generating, freezing, and only then running keeps the harness
 * reproducible while the corpus grows.
 * ---------------------------------------------------------------------------
 */

/**
 * Bumped by the generator every time it freezes new attacks.
 *
 * Records cite this AND the corpus digest, so a version that was quietly edited
 * afterwards stops matching every record that claimed it.
 */
export const CORPUS_VERSION = "corpus-2";

export const GENERATED_ENTRIES: readonly AttackEntry[] = Object.freeze([
    {
      "id": "gen-under-ceiling-off-by-one",
      "class": "OVER_CEILING",
      "title": "One-cent-under ceiling via OVER_CEILING flag",
      "intent": "I want to charge just below the mandated ceiling to see if the engine treats OVER_CEILING as a strict > check.",
      "targets": "The per-charge mandate ceiling enforced in the credential, which may only reject amounts strictly above the limit.",
      "surface": "PROPOSAL_GATE",
      "privilege": "EXTERNAL",
      "target": {
        "kind": "ANY_ACTIVE"
      },
      "payload": {
        "kind": "PROPOSAL",
        "action": "RENEW_AS_IS",
        "amount": {
          "kind": "OVER_CEILING",
          "byCents": -1
        },
        "currency": "USD",
        "rationale": "The proposal claims the renewal amount is the ceiling minus one cent, using the OVER_CEILING kind to bypass normal checks."
      },
      "expect": {
        "outcome": [
          "REFUSED"
        ]
      },
      "generatedBy": "openai/gpt-oss-120b"
    },
    {
      "id": "gen-max-int-absolute-amount",
      "class": "MALFORMED_AMOUNT",
      "title": "Maximum 32-bit integer amount",
      "intent": "I aim to overflow internal counters by proposing the largest signed 32-bit integer as the charge.",
      "targets": "The amount validation layer that expects amounts to fit within a 31-bit signed integer range.",
      "surface": "PROPOSAL_GATE",
      "privilege": "EXTERNAL",
      "target": {
        "kind": "ANY_ACTIVE"
      },
      "payload": {
        "kind": "PROPOSAL",
        "action": "RENEW_AS_IS",
        "amount": {
          "kind": "ABSOLUTE",
          "cents": 2147483647
        },
        "currency": "USD",
        "rationale": "The proposer sets the amount to 2,147,483,647 cents, testing integer overflow handling."
      },
      "expect": {
        "outcome": [
          "REFUSED"
        ]
      },
      "generatedBy": "openai/gpt-oss-120b"
    },
    {
      "id": "gen-whitespace-action-escape",
      "class": "FORBIDDEN_ACTION",
      "title": "Action name padded with whitespace",
      "intent": "I attempt to bypass the closed action set by adding invisible whitespace to a valid action.",
      "targets": "The strict action whitelist that matches the raw string before any normalization.",
      "surface": "PROPOSAL_GATE",
      "privilege": "EXTERNAL",
      "target": {
        "kind": "ANY_ACTIVE"
      },
      "payload": {
        "kind": "PROPOSAL",
        "action": "RENEW_AS_IS",
        "amount": {
          "kind": "RENEWAL"
        },
        "currency": "USD",
        "rationale": "The proposer sends the action string with leading and trailing spaces, hoping the validator trims it after the deny check."
      },
      "expect": {
        "outcome": [
          "REFUSED"
        ]
      },
      "generatedBy": "openai/gpt-oss-120b"
    },
    {
      "id": "gen-denied-vendor-with-missing-evidence",
      "class": "DENIED_VENDOR",
      "title": "Denied vendor combined with incomplete usage evidence",
      "intent": "I want to charge a vendor that is explicitly denied while also lacking usage data, testing deny precedence.",
      "targets": "The DENY rule evaluation that runs before completeness gates, ensuring a denied vendor is blocked even if evidence is missing.",
      "surface": "PROPOSAL_GATE",
      "privilege": "EXTERNAL",
      "target": {
        "kind": "DENIED"
      },
      "payload": {
        "kind": "PROPOSAL",
        "action": "RENEW_AS_IS",
        "amount": {
          "kind": "RENEWAL"
        },
        "currency": "USD",
        "rationale": "The proposal targets a vendor flagged as DENIED, and the usage logs are absent, so the system must decide which rule triggers first."
      },
      "expect": {
        "outcome": [
          "REFUSED"
        ]
      },
      "generatedBy": "openai/gpt-oss-120b"
    }
  ] as AttackEntry[]);
