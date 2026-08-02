import { describe, expect, it } from "vitest";
import {
  ATTACK_CLASSES,
  CORPUS,
  CORPUS_VERSION,
  HAND_WRITTEN,
  classesIn,
  corpusDigest,
  externalEntries,
  type AttackEntry,
} from "./corpus";

/**
 * The corpus is data, and these are the properties that make it evidence rather
 * than a list of ideas:
 *
 *   FROZEN      the same corpus hashes the same, so a record citing it means
 *               something a year later
 *   COMPLETE    every defence has at least one attacker aimed at it
 *   FALSIFIABLE every attacker states what the defence must do, so an attack
 *               can actually be recorded as having succeeded
 *   PORTABLE    no vendor ids, no absolute assumptions about seeded data
 */

describe("attack corpus v1", () => {
  it("hashes identically across calls", () => {
    expect(corpusDigest()).toBe(corpusDigest());
    expect(corpusDigest()).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes its hash when any payload changes by one character", () => {
    // The property that makes citing a corpus version load-bearing.
    const edited: AttackEntry[] = CORPUS.map((entry, index) =>
      index === 0 ? { ...entry, intent: `${entry.intent}.` } : entry,
    );
    expect(corpusDigest(edited)).not.toBe(corpusDigest());
  });

  it("gives every defence at least one attacker", () => {
    // If a class exists in the taxonomy and nothing attacks it, either the
    // defence is untested or the class is decoration.
    expect(classesIn().sort()).toEqual([...ATTACK_CLASSES].sort());
  });

  it("makes every attacker name the defence it attacks", () => {
    for (const entry of CORPUS) {
      expect(entry.targets, entry.id).toBeTruthy();
      expect(entry.targets.length, entry.id).toBeGreaterThan(20);
      expect(entry.intent, entry.id).toBeTruthy();
    }
  });

  it("makes every attack falsifiable", () => {
    // An attack with no expectation can never be recorded as having succeeded,
    // which would make the whole scoreboard unfalsifiable.
    for (const entry of CORPUS) {
      expect(entry.expect.outcome.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("uses stable, unique ids", () => {
    const ids = CORPUS.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names no vendor ids, so a reseed cannot invalidate it", () => {
    // Selectors, not identifiers. A corpus full of UUIDs is frozen to one
    // database and stops being runnable the moment anyone reseeds.
    const serialized = JSON.stringify(CORPUS);
    expect(serialized).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });

  it("separates what an outsider can do from what an insider can do", () => {
    const external = externalEntries();
    const operator = CORPUS.filter((entry) => entry.privilege === "OPERATOR");

    expect(external.length).toBeGreaterThan(0);
    expect(operator.length).toBeGreaterThan(0);

    // Everything runnable unattended goes through a surface a stranger actually
    // holds: they can send us text, or they can own the model outright.
    for (const entry of external) {
      expect(["INBOUND_MESSAGE", "PROPOSAL_GATE"], entry.id).toContain(
        entry.surface,
      );
    }

    // And everything needing our own credentials is marked as such, so the
    // headline number is never inflated with attacks that presuppose the
    // attacker already runs the company.
    for (const entry of operator) {
      expect(["ADAPTER_DIRECT", "DATABASE"], entry.id).toContain(entry.surface);
    }
  });

  it("covers both sides of the ceiling boundary", () => {
    const ceiling = CORPUS.filter((entry) => entry.class === "OVER_CEILING");
    const amounts = ceiling.map((entry) =>
      entry.payload.kind === "PROPOSAL" ? entry.payload.amount.kind : null,
    );

    // One cent over is the honest test; 96× is the theatrical one. A corpus
    // with only the theatrical version would not prove the boundary is exact.
    expect(amounts).toContain("OVER_CEILING");
    expect(amounts).toContain("MULTIPLE_OF_CEILING");
  });

  it("is versioned, and the version moves when the corpus grows", () => {
    // Not pinned to a literal: the generator bumps this every time it freezes
    // new attacks, and a test asserting "corpus-1" forever would have to be
    // edited on every generation — which is how a version stops meaning
    // anything.
    expect(CORPUS_VERSION).toMatch(/^corpus-\d+$/);
  });

  it("distinguishes what we thought of from what a model thought of", () => {
    // Provenance is the point. A record citing this corpus can tell a reader
    // which attacks were authored and which were generated, and generated ones
    // name the model that produced them.
    for (const entry of HAND_WRITTEN) {
      expect(entry.generatedBy, entry.id).toBeNull();
    }

    for (const entry of CORPUS.filter((e) => e.id.startsWith("gen-"))) {
      expect(entry.generatedBy, entry.id).toBeTruthy();
    }
  });

  it("holds generated attacks to the same rules as authored ones", () => {
    // Everything asserted above about the hand-written set applies to the whole
    // corpus. A generated attack is not a second-class entry with looser rules;
    // it went through a stricter validator to get here.
    for (const entry of CORPUS) {
      expect(entry.expect.outcome.length, entry.id).toBeGreaterThan(0);
      expect(entry.targets.length, entry.id).toBeGreaterThan(20);
    }
  });
});
