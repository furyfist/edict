import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Invariant 2, checked rather than trusted.
 *
 * The review question for any change to this directory is: does this give the
 * language model a path to money that did not exist before? This test answers
 * it mechanically, so the answer does not depend on a reviewer noticing an
 * import at the top of a long diff.
 */

const FORBIDDEN = ["lib/prava", "lib/ledger", "lib/policy", "lib/outcome"];

function sourcesIn(dir: string): string[] {
  return readdirSync(dir).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts"),
  );
}

describe("lib/agent has no path to money", () => {
  it("does not import the payment boundary, the ledger, or the engine", () => {
    const dir = __dirname;
    const files = sourcesIn(dir);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const text = readFileSync(join(dir, file), "utf8");
      const imports = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map(
        (m) => m[1],
      );

      for (const specifier of imports) {
        const normalized = specifier.replace(/\\/g, "/");
        for (const forbidden of FORBIDDEN) {
          const tail = forbidden.split("/").pop()!;
          expect(
            normalized.includes(forbidden) ||
              normalized.startsWith(`../${tail}`),
            `${file} imports ${specifier}, which reaches ${forbidden}`,
          ).toBe(false);
        }
      }
    }
  });

  it("imports nothing from lib except contracts", () => {
    const dir = __dirname;
    for (const file of sourcesIn(dir)) {
      const text = readFileSync(join(dir, file), "utf8");
      const parentImports = [...text.matchAll(/from\s+["'](\.\.\/[^"']+)["']/g)]
        .map((m) => m[1])
        .map((s) => s.replace(/\\/g, "/"));

      for (const specifier of parentImports) {
        expect(
          specifier.startsWith("../contracts"),
          `${file} imports ${specifier}; lib/agent may import only lib/contracts`,
        ).toBe(true);
      }
    }
  });
});
