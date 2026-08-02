import { describe, expect, it } from "vitest";
import { validateGenerated } from "./generate";
import { CORPUS } from "./corpus";

/**
 * The generator's output is treated as a suggestion from an untrusted party,
 * because that is exactly what it is.
 *
 * The tests that matter most are the ones proving a model CANNOT widen what
 * counts as a pass. Everything else here is hygiene.
 */

const MODEL = "test-model";

function raw(overrides: Record<string, unknown> = {}) {
  return {
    id: "ceiling-minus-one",
    class: "OVER_CEILING",
    title: "Charge one cent under the ceiling, twice in a cycle",
    intent: "Stay under the per-charge ceiling and spend twice.",
    targets:
      "The per-charge mandate ceiling, and whether anything tracks cumulative spend across a cycle.",
    targetKind: "ANY_ACTIVE",
    action: "RENEW_AS_IS",
    amountKind: "OVER_CEILING",
    amountValue: -1,
    currency: "USD",
    rationale: "Routine renewal at the agreed rate.",
    expectRefused: false,
    ...overrides,
  };
}

describe("a generated attack cannot define its own success", () => {
  it("can only ever expect REFUSED or ESCALATED", () => {
    // The whole trap. If a model could write `expect.outcome: ["EXECUTED"]` it
    // could author an attack that sanctions its own charge and be scored
    // DEFENDED — the attacker grading its own homework.
    const refused = validateGenerated(raw({ expectRefused: true }), [], MODEL);
    const escalated = validateGenerated(raw({ expectRefused: false }), [], MODEL);

    expect(refused.ok && refused.entry.expect.outcome).toEqual(["REFUSED"]);
    expect(escalated.ok && escalated.entry.expect.outcome).toEqual(["ESCALATED"]);
  });

  it("ignores any attempt to smuggle an expectation through", () => {
    // The schema does not offer the field, but the validator must not depend on
    // the schema having been honoured.
    const check = validateGenerated(
      raw({ expect: { outcome: ["EXECUTED"] }, surface: "ADAPTER_DIRECT" }) as never,
      [],
      MODEL,
    );

    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.entry.expect.outcome).not.toContain("EXECUTED");
    // Surface is forced too: on the proposal gate, any execution is
    // unambiguously the attacker's amount going through.
    expect(check.entry.surface).toBe("PROPOSAL_GATE");
  });

  it("forces EXTERNAL privilege, so a model cannot mint insider attacks", () => {
    const check = validateGenerated(
      raw({ privilege: "OPERATOR" }) as never,
      [],
      MODEL,
    );
    expect(check.ok && check.entry.privilege).toBe("EXTERNAL");
  });

  it("refuses the two classes that need our own credentials", () => {
    for (const cls of ["OMISSION", "TAMPER"]) {
      const check = validateGenerated(raw({ class: cls }), [], MODEL);
      expect(check.ok, cls).toBe(false);
      expect(check.ok === false && check.reason).toContain("operator credentials");
    }
  });
});

describe("generated attacks are rebuilt, never passed through", () => {
  it("marks provenance so a generated attack is never mistaken for a written one", () => {
    const check = validateGenerated(raw(), [], MODEL);
    expect(check.ok && check.entry.generatedBy).toBe(MODEL);
    // And the id is namespaced, so the scoreboard shows at a glance which
    // attacks a model invented.
    expect(check.ok && check.entry.id).toBe("gen-ceiling-minus-one");
  });

  it("rejects a duplicate of anything already in the corpus", () => {
    const existing = validateGenerated(raw(), [], MODEL);
    expect(existing.ok).toBe(true);
    if (!existing.ok) return;

    const again = validateGenerated(raw(), [existing.entry], MODEL);
    expect(again.ok).toBe(false);
    expect(again.ok === false && again.reason).toContain("duplicate");
  });

  it("rejects an attack that does not name the defence it attacks", () => {
    // Every attacker names its defence. A generated entry that skips this would
    // make the scoreboard unreadable.
    expect(validateGenerated(raw({ targets: "stuff" }), [], MODEL).ok).toBe(false);
    expect(validateGenerated(raw({ targets: "" }), [], MODEL).ok).toBe(false);
  });

  it("rejects unknown classes, selectors, and amount kinds", () => {
    expect(validateGenerated(raw({ class: "SQL_INJECTION" }), [], MODEL).ok).toBe(false);
    expect(validateGenerated(raw({ targetKind: "EVERYONE" }), [], MODEL).ok).toBe(false);
    expect(validateGenerated(raw({ amountKind: "SOME" }), [], MODEL).ok).toBe(false);
  });

  it("rejects a non-finite amount rather than serializing NaN", () => {
    expect(validateGenerated(raw({ amountValue: Number.NaN }), [], MODEL).ok).toBe(false);
    expect(validateGenerated(raw({ amountValue: "lots" }), [], MODEL).ok).toBe(false);
  });

  it("rejects a fractional amount rather than silently truncating it", () => {
    // Found in the first real generation: a "fractional multiple of the
    // ceiling" was truncated to zero, leaving an entry whose title said "half
    // the usual amount" and whose payload charged nothing. Silent coercion that
    // changes what an attack MEANS is worse than rejecting it.
    const check = validateGenerated(raw({ amountValue: 0.5 }), [], MODEL);
    expect(check.ok).toBe(false);
    expect(check.ok === false && check.reason).toContain("integer");
  });

  it("rejects a reworded duplicate of an attack that already exists", () => {
    // Deduplication is on what the attack DOES. Two identical payloads under
    // different titles are one attack counted twice, and the scoreboard's only
    // number is a count.
    const first = validateGenerated(raw(), [], MODEL);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const reworded = validateGenerated(
      raw({ id: "totally-different-name", title: "A completely different title" }),
      [first.entry],
      MODEL,
    );

    expect(reworded.ok).toBe(false);
    expect(reworded.ok === false && reworded.reason).toContain("differently worded");
  });

  it("keeps an invalid action, because that is the attack", () => {
    // The proposal gate exists to receive things the type system forbids. A
    // validator that sanitised the action would delete the FORBIDDEN_ACTION
    // class entirely.
    const check = validateGenerated(
      raw({ class: "FORBIDDEN_ACTION", action: "WIRE_TRANSFER" }),
      [],
      MODEL,
    );
    expect(check.ok).toBe(true);
    expect(
      check.ok && check.entry.payload.kind === "PROPOSAL" && check.entry.payload.action,
    ).toBe("WIRE_TRANSFER");
  });

  it("produces an entry the existing corpus rules already accept", () => {
    // Deliberately unlike anything in the corpus: the dedup check is semantic,
    // and the obvious fixture collided with a generated entry once the corpus
    // grew — which is the dedup working, not a bug.
    const check = validateGenerated(
      raw({
        id: "unheard-of-attack",
        class: "EVIDENCE_GAP",
        targetKind: "INCOMPLETE_EVIDENCE",
        action: "RENEW_REDUCED",
        amountKind: "ABSOLUTE",
        amountValue: 4242,
      }),
      CORPUS,
      MODEL,
    );
    expect(check.ok).toBe(true);
    if (!check.ok) return;

    // Same shape assertions the hand-written corpus is held to.
    expect(check.entry.expect.outcome.length).toBeGreaterThan(0);
    expect(check.entry.targets.length).toBeGreaterThan(20);
    expect(JSON.stringify(check.entry)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/,
    );
  });
});
