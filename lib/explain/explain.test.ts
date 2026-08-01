import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { explain } from "./index";
import { fixtureLedgerEntry, resetFixtures } from "../fixtures";
import { LEDGER_OUTCOMES, VERDICT_REASONS } from "../contracts";

beforeEach(() => resetFixtures());

describe("explanations are structurally identical across entries", () => {
  it("renders the same fields for every outcome", () => {
    for (const outcome of LEDGER_OUTCOMES) {
      const explanation = explain(fixtureLedgerEntry({ outcome }));

      expect(Object.keys(explanation).sort()).toEqual([
        "attribution",
        "counterfactual",
        "financialImpact",
        "headline",
        "reason",
        "sourceFragment",
      ]);
      expect(explanation.headline).toBeTruthy();
      expect(explanation.reason).toBeTruthy();
      expect(explanation.financialImpact).toBeTruthy();
    }
  });

  it("names all four actors on every entry", () => {
    for (const outcome of LEDGER_OUTCOMES) {
      const { attribution } = explain(fixtureLedgerEntry({ outcome }));
      expect(attribution.decidedBy).toBeTruthy();
      expect(attribution.authorizedBy).toBeTruthy();
      expect(attribution.executedBy).toBeTruthy();
      expect(attribution.recordedBy).toBeTruthy();
    }
  });

  it("has a template for every verdict reason", () => {
    for (const reason of VERDICT_REASONS) {
      const explanation = explain(fixtureLedgerEntry({ reason }));
      expect(explanation.reason).toBeTruthy();
      expect(explanation.reason).not.toContain("undefined");
    }
  });
});

describe("every refusal says nothing was charged", () => {
  it("states the financial impact plainly", () => {
    for (const outcome of ["REFUSED", "ESCALATED", "NETWORK_DECLINE"] as const) {
      const explanation = explain(fixtureLedgerEntry({ outcome }));
      expect(explanation.financialImpact).toMatch(/was not charged/);
    }
  });

  it("says money moved when money moved", () => {
    const explanation = explain(fixtureLedgerEntry({ outcome: "EXECUTED" }));
    expect(explanation.financialImpact).toMatch(/was charged/);
  });

  it("is honest about an unconfirmed outcome", () => {
    const explanation = explain(
      fixtureLedgerEntry({ outcome: "ADAPTER_FAILURE" }),
    );
    expect(explanation.financialImpact).toMatch(/may or may not/);
  });
});

describe("explanations quote the user's own words", () => {
  it("carries the cited source fragment through", () => {
    const explanation = explain(
      fixtureLedgerEntry({
        citedSourceFragment: "Never renew anything from CloudSync Pro.",
      }),
    );
    expect(explanation.sourceFragment).toBe(
      "Never renew anything from CloudSync Pro.",
    );
  });

  it("keeps model prose out of the rendered explanation", () => {
    // The rationale is carried on the entry and rendered separately. It must
    // not appear inside any templated string, because a reader has to be able
    // to tell a verified fact from a plausible sentence.
    const rationale = "TRUST ME THIS IS DEFINITELY FINE TO CHARGE";
    const explanation = explain(
      fixtureLedgerEntry({ agentRationale: rationale }),
    );

    const rendered = [
      explanation.headline,
      explanation.reason,
      explanation.counterfactual ?? "",
      explanation.financialImpact,
      explanation.sourceFragment ?? "",
    ].join(" ");

    expect(rendered).not.toContain(rationale);
  });
});

describe("counterfactuals are rendered from structured data", () => {
  it("names both figures for a ceiling breach", () => {
    const explanation = explain(
      fixtureLedgerEntry({
        outcome: "ESCALATED",
        reason: "AMOUNT_EXCEEDS_CEILING",
        detail: {
          counterfactual: {
            kind: "AMOUNT_BELOW_CEILING",
            detail: { ceiling: 100_00, actualAmount: 250_00 },
          },
        },
      }),
    );

    expect(explanation.counterfactual).toContain("$100.00");
    expect(explanation.counterfactual).toContain("$250.00");
  });

  it("names the missing evidence in plain language", () => {
    const explanation = explain(
      fixtureLedgerEntry({
        outcome: "ESCALATED",
        reason: "MISSING_EVIDENCE",
        detail: {
          counterfactual: {
            kind: "EVIDENCE_PRESENT",
            detail: { missingGaps: ["NO_USAGE_DATA"] },
          },
        },
      }),
    );

    expect(explanation.counterfactual).toContain("seat usage data");
    // Not the raw enum. A user reads this.
    expect(explanation.counterfactual).not.toContain("NO_USAGE_DATA");
  });

  it("is null when there is no counterfactual", () => {
    const explanation = explain(fixtureLedgerEntry({ detail: {} }));
    expect(explanation.counterfactual).toBeNull();
  });
});

describe("the explainer is deterministic and model-free", () => {
  it("returns identical output for identical input", () => {
    const entry = fixtureLedgerEntry();
    const first = explain(entry);
    for (let i = 0; i < 20; i += 1) {
      expect(explain(entry)).toEqual(first);
    }
  });

  it("calls no model and reads no clock", () => {
    const dir = __dirname;
    const sources = readdirSync(dir).filter(
      (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
    );

    for (const file of sources) {
      const text = readFileSync(join(dir, file), "utf8");
      expect(text).not.toContain("anthropic");
      expect(text).not.toContain("fetch(");
      expect(text).not.toContain("Date.now");
      expect(text).not.toContain("Math.random");
      // No import reaching the agent, which is where the model lives.
      expect(text).not.toMatch(/from\s+["']\.\.\/agent/);
    }
  });
});
