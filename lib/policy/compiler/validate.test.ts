import { describe, expect, it } from "vitest";
import { containsFragment, validateCompiledRules } from "./validate";
import { compilePolicy } from "./index";
import type { RawCompiledRule } from "./index";

/**
 * Policy compiler validation.
 *
 * The compiler is the most dangerous component in this system: it is where a
 * language model's output becomes authority. A mis-compiled policy grants power
 * nobody agreed to, and unlike a bad proposal, nothing downstream catches it —
 * the engine will faithfully enforce whatever rules it is given.
 *
 * Two invariants carry the weight here:
 *
 *   1. Every rule must quote the user's text VERBATIM. The compiler can point
 *      at words a human wrote; it cannot conjure authority from nothing.
 *   2. ALLOW_AUTO without an amount ceiling is UNCOMPILABLE. Enforced where
 *      authority is created, not where it is spent.
 */

const VENDORS = [
  { id: "vendor-vercel", name: "Vercel", category: "infrastructure" },
  { id: "vendor-figma", name: "Figma", category: "design" },
];

const TEXT = [
  "Never auto-renew Vercel.",
  "Auto-renew anything under $500 a month.",
  "Anything over $500 a month needs my approval.",
].join(" ");

function raw(overrides: Partial<RawCompiledRule> = {}): RawCompiledRule {
  return {
    effect: "ALLOW_AUTO",
    scopeKind: "ANY",
    maxAmountCents: 50000,
    sourceFragment: "Auto-renew anything under $500 a month.",
    ...overrides,
  };
}

function run(rawRules: RawCompiledRule[], unsupportedClauses: string[] = []) {
  return validateCompiledRules({
    englishText: TEXT,
    rawRules,
    unsupportedClauses,
    vendors: VENDORS,
  });
}

// ---------------------------------------------------------------------------

describe("containsFragment — the provenance check", () => {
  it("accepts an exact quote", () => {
    expect(containsFragment(TEXT, "Never auto-renew Vercel.")).toBe(true);
  });

  it("tolerates case and whitespace differences", () => {
    expect(containsFragment(TEXT, "never   AUTO-RENEW    vercel.")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(containsFragment(TEXT, "  Never auto-renew Vercel.  ")).toBe(true);
  });

  it("rejects a paraphrase", () => {
    // This is the whole point. A model that reworded the user's sentence has
    // stopped quoting them and started speaking for them.
    expect(containsFragment(TEXT, "Do not automatically renew Vercel")).toBe(false);
  });

  it("rejects text that never appeared", () => {
    expect(containsFragment(TEXT, "Auto-renew anything under $50,000.")).toBe(false);
  });

  it("rejects an empty fragment", () => {
    expect(containsFragment(TEXT, "")).toBe(false);
    expect(containsFragment(TEXT, "   ")).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("fabricated authority is uncompilable", () => {
  it("rejects a rule quoting text the user never wrote", () => {
    const result = run([
      raw({ sourceFragment: "Auto-renew anything under $50,000 a month." }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain("does not appear");
    }
  });

  it("rejects a rule with no sourceFragment at all", () => {
    const result = run([raw({ sourceFragment: "" })]);
    expect(result.ok).toBe(false);
  });

  it("rejects a rule whose sourceFragment is only whitespace", () => {
    const result = run([raw({ sourceFragment: "   " })]);
    expect(result.ok).toBe(false);
  });

  it("names the offending clause on the error", () => {
    const fabricated = "Approve everything without asking.";
    const result = run([raw({ sourceFragment: fabricated })]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].clause).toBe(fabricated);
    }
  });
});

// ---------------------------------------------------------------------------

describe("unbounded autonomy is uncompilable", () => {
  it("rejects ALLOW_AUTO with no amount ceiling", () => {
    const result = run([raw({ maxAmountCents: null })]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain("any amount");
    }
  });

  it("rejects ALLOW_AUTO when the ceiling field is absent entirely", () => {
    const rule = raw();
    delete (rule as Partial<RawCompiledRule>).maxAmountCents;
    expect(run([rule]).ok).toBe(false);
  });

  it("accepts ALLOW_AUTO with a ceiling", () => {
    expect(run([raw({ maxAmountCents: 50000 })]).ok).toBe(true);
  });

  it("does not require a ceiling on DENY", () => {
    const result = run([
      raw({
        effect: "DENY",
        scopeKind: "VENDOR",
        scopeVendorId: "vendor-vercel",
        maxAmountCents: null,
        sourceFragment: "Never auto-renew Vercel.",
      }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("does not require a ceiling on REQUIRE_APPROVAL", () => {
    const result = run([
      raw({
        effect: "REQUIRE_APPROVAL",
        maxAmountCents: null,
        sourceFragment: "Anything over $500 a month needs my approval.",
      }),
    ]);
    expect(result.ok).toBe(true);
  });

  it("keeps an unbounded rule out of the understood list", () => {
    // It must not appear as something we accepted, even for display.
    const result = run([raw({ maxAmountCents: null })]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.understood).toHaveLength(0);
    }
  });
});

// ---------------------------------------------------------------------------

describe("scope", () => {
  it("rejects an unknown vendor", () => {
    const result = run([
      raw({
        effect: "DENY",
        scopeKind: "VENDOR",
        scopeVendorId: "vendor-nonexistent",
        sourceFragment: "Never auto-renew Vercel.",
      }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects a vendor scope with no id", () => {
    const result = run([
      raw({
        effect: "DENY",
        scopeKind: "VENDOR",
        scopeVendorId: null,
        sourceFragment: "Never auto-renew Vercel.",
      }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown category", () => {
    const result = run([
      raw({ scopeKind: "CATEGORY", scopeCategory: "aerospace" }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty category", () => {
    const result = run([raw({ scopeKind: "CATEGORY", scopeCategory: "  " })]);
    expect(result.ok).toBe(false);
  });

  it("accepts a known category", () => {
    const result = run([raw({ scopeKind: "CATEGORY", scopeCategory: "design" })]);
    expect(result.ok).toBe(true);
  });

  it("rejects an unknown scope kind", () => {
    expect(run([raw({ scopeKind: "EVERYTHING" })]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("conditions", () => {
  it.each([
    ["zero", 0],
    ["negative", -50000],
    ["fractional", 500.5],
  ])("rejects a %s amount ceiling", (_label, maxAmountCents) => {
    expect(run([raw({ maxAmountCents })]).ok).toBe(false);
  });

  it.each([-1, 101, 60.5])("rejects usage percentage %s", (minActiveSeatPct) => {
    expect(run([raw({ minActiveSeatPct })]).ok).toBe(false);
  });

  it.each([0, 100])("accepts usage percentage %s", (minActiveSeatPct) => {
    expect(run([raw({ minActiveSeatPct })]).ok).toBe(true);
  });

  it("rejects an unknown frequency", () => {
    expect(run([raw({ frequency: "FORTNIGHTLY" })]).ok).toBe(false);
  });

  it("accepts a known frequency", () => {
    expect(run([raw({ frequency: "MONTHLY" })]).ok).toBe(true);
  });

  it("rejects a non-positive renewal window", () => {
    expect(run([raw({ renewalWithinDays: 0 })]).ok).toBe(false);
    expect(run([raw({ renewalWithinDays: -7 })]).ok).toBe(false);
  });

  it("carries valid conditions through to the compiled rule", () => {
    const result = run([
      raw({ maxAmountCents: 50000, minActiveSeatPct: 60, renewalWithinDays: 7 }),
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.rules[0].conditions).toEqual({
        maxAmountCents: 50000,
        minActiveSeatPct: 60,
        renewalWithinDays: 7,
      });
    }
  });
});

// ---------------------------------------------------------------------------

describe("effects", () => {
  it("rejects an unknown effect", () => {
    expect(run([raw({ effect: "ALLOW_EVERYTHING" })]).ok).toBe(false);
  });

  it.each(["allow_auto", "Allow_Auto"])("rejects miscased effect %s", (effect) => {
    expect(run([raw({ effect })]).ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe("the compiled result", () => {
  it("rejects an empty rule set", () => {
    const result = run([]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain("No rules");
    }
  });

  it("appends the terminal default rule", () => {
    const result = run([raw()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const last = result.draft.rules[result.draft.rules.length - 1];
      expect(last.effect).toBe("REQUIRE_APPROVAL");
      expect(last.scope).toEqual({ kind: "ANY" });
    }
  });

  it("gives the terminal rule the highest ordinal", () => {
    // The engine sorts by ordinal, so a terminal rule that did not sort last
    // would shadow the user's own rules.
    const result = run([
      raw({
        effect: "DENY",
        scopeKind: "VENDOR",
        scopeVendorId: "vendor-vercel",
        maxAmountCents: null,
        sourceFragment: "Never auto-renew Vercel.",
      }),
      raw(),
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      const ordinals = result.draft.rules.map((rule) => rule.ordinal);
      expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
      expect(new Set(ordinals).size).toBe(ordinals.length);
    }
  });

  it("preserves the order the rules were given in", () => {
    const result = run([
      raw({
        effect: "DENY",
        scopeKind: "VENDOR",
        scopeVendorId: "vendor-vercel",
        maxAmountCents: null,
        sourceFragment: "Never auto-renew Vercel.",
      }),
      raw(),
    ]);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.rules[0].effect).toBe("DENY");
      expect(result.draft.rules[1].effect).toBe("ALLOW_AUTO");
    }
  });

  it("keeps the user's text verbatim on the draft", () => {
    const result = run([raw()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.draft.englishText).toBe(TEXT);
    }
  });
});

// ---------------------------------------------------------------------------

describe("rejections show their work", () => {
  it("returns the rules that WERE understood alongside the errors", () => {
    // Silent partial compilation is the worst failure this component has. A
    // rejection must show what was read, not just what failed.
    const result = run([
      raw(),
      raw({ sourceFragment: "Something the user never wrote." }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.understood).toHaveLength(1);
      expect(result.understood[0].effect).toBe("ALLOW_AUTO");
      expect(result.errors).toHaveLength(1);
    }
  });

  it("surfaces unsupported clauses as errors rather than dropping them", () => {
    const clause = "Let Dana approve anything on Fridays.";
    const result = run([raw()], [clause]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.clause === clause)).toBe(true);
      expect(result.unsupportedClauses).toContain(clause);
    }
  });

  it("fails the whole compilation when any clause is unsupported", () => {
    // Partial success would silently activate a policy the user did not write.
    expect(run([raw()], ["something unrepresentable"]).ok).toBe(false);
  });

  it("collects every error rather than stopping at the first", () => {
    const result = run([
      raw({ sourceFragment: "not in the text" }),
      raw({ effect: "NONSENSE" }),
      raw({ scopeKind: "CATEGORY", scopeCategory: "aerospace" }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(3);
    }
  });
});

// ---------------------------------------------------------------------------

describe("determinism", () => {
  it("returns an identical result across repeated runs", () => {
    const rules = [
      raw({
        effect: "DENY",
        scopeKind: "VENDOR",
        scopeVendorId: "vendor-vercel",
        maxAmountCents: null,
        sourceFragment: "Never auto-renew Vercel.",
      }),
      raw(),
    ];

    const first = run(rules);
    for (let i = 0; i < 20; i++) {
      expect(run(rules)).toEqual(first);
    }
  });
});

// ---------------------------------------------------------------------------

describe("compilePolicy guards", () => {
  it("rejects empty policy text without calling the model", async () => {
    const result = await compilePolicy({ englishText: "   ", vendors: VENDORS });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].message).toContain("empty");
    }
  });

  it("fails closed when the model is unreachable", async () => {
    // No OPENAI_API_KEY in the test environment. An unavailable compiler must
    // produce a rejection, never a partial or defaulted policy.
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const result = await compilePolicy({ englishText: TEXT, vendors: VENDORS });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.understood).toHaveLength(0);
      }
    } finally {
      if (previous !== undefined) process.env.OPENAI_API_KEY = previous;
    }
  });
});
