import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The two approval paths stay separate.
 *
 * The trust argument depends on a distinction that is easy to erase under time
 * pressure: an in-app approval spends existing authority, and a ceiling raise
 * creates new authority. Erasing it would look like a small refactor — one
 * `approve` handler, a branch inside it — and it would turn "the agent cannot
 * exceed its authority" from a structural claim into a claim about discipline.
 *
 * These tests check the codebase itself, because the property is about what
 * code exists rather than about what any single function returns.
 */

const ROOT = join(__dirname, "..");

function sourcesUnder(dir: string): string[] {
  const found: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      if (name === "node_modules" || name === ".next" || name === ".git") continue;
      const full = join(current, name);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (
        (name.endsWith(".ts") || name.endsWith(".tsx")) &&
        !name.endsWith(".test.ts")
      ) {
        found.push(full);
      }
    }
  };
  walk(dir);
  return found;
}

describe("no code path raises a ceiling without a ceremony", () => {
  it("nothing writes amountCeilingCents on an existing mandate row", () => {
    const offenders: string[] = [];

    for (const file of [
      ...sourcesUnder(join(ROOT, "lib")),
      ...sourcesUnder(join(ROOT, "app")),
    ]) {
      const text = readFileSync(file, "utf8");
      // `prisma.mandate.update` with a ceiling in the data block would be a
      // ceiling raise performed locally. The mirror path is allowed to write
      // the ceiling only when reflecting what the network reported.
      const updates = text.match(
        /prisma\.mandate\.update\(\{[\s\S]{0,600}?\}\)/g,
      );
      if (!updates) continue;

      for (const block of updates) {
        if (!block.includes("amountCeilingCents")) continue;
        // Permitted: the mirror, which writes what the network said.
        const isMirror =
          file.endsWith("mandates.ts") || file.endsWith("live.ts");
        if (!isMirror) {
          offenders.push(file);
        }
      }
    }

    expect(
      offenders,
      `these files modify a mandate ceiling outside the mirror: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("the ceiling raise path demands a ceremony id", () => {
    const text = readFileSync(join(ROOT, "lib/approvals/ceiling.ts"), "utf8");
    expect(text).toContain("passkeyCeremonyId");
    // The empty-ceremony check is the shape a bypass would take. It must exist.
    expect(text).toMatch(/passkeyCeremonyId\.trim\(\)/);
  });

  it("has no override, force, or bypass parameter anywhere in approvals", () => {
    for (const file of sourcesUnder(join(ROOT, "lib/approvals"))) {
      const text = readFileSync(file, "utf8").toLowerCase();
      for (const smell of [
        "skippasskey",
        "forceapprove",
        "overrideceiling",
        "bypassceremony",
        "allowunbounded",
      ]) {
        expect(text, `${file} contains ${smell}`).not.toContain(smell);
      }
    }
  });
});

describe("the in-app approval route refuses ceiling raises", () => {
  it("checks requiresPasskeyCeremony before approving", () => {
    const text = readFileSync(
      join(ROOT, "app/api/approvals/[id]/approve/route.ts"),
      "utf8",
    );
    expect(text).toContain("requiresPasskeyCeremony");
    expect(text).toMatch(/requiresPasskey/);
  });

  it("keeps the two routes as separate files", () => {
    // One handler with a branch would be the collapse this test exists to
    // prevent. Two files means a reviewer sees two things.
    const approve = join(ROOT, "app/api/approvals/[id]/approve/route.ts");
    const ceiling = join(ROOT, "app/api/approvals/[id]/ceiling-raise/route.ts");
    expect(statSync(approve).isFile()).toBe(true);
    expect(statSync(ceiling).isFile()).toBe(true);
  });
});

describe("expiry is never revived", () => {
  it("has no path that moves an approval out of EXPIRED", () => {
    for (const file of sourcesUnder(join(ROOT, "lib/approvals"))) {
      const text = readFileSync(file, "utf8");
      // Reviving would mean writing a non-terminal status onto a row whose
      // status is EXPIRED. No such update exists.
      expect(text).not.toMatch(/status:\s*["']EXPIRED["'][\s\S]{0,200}PENDING/);
      expect(text).not.toContain("unexpire");
      expect(text).not.toContain("reviveApproval");
    }
  });
});

describe("the ledger has no delete path", () => {
  it("nothing anywhere deletes a ledger entry outside the seed reset", () => {
    const offenders: string[] = [];
    for (const file of [
      ...sourcesUnder(join(ROOT, "lib")),
      ...sourcesUnder(join(ROOT, "app")),
    ]) {
      const text = readFileSync(file, "utf8");
      if (!/ledgerEntry\.delete/.test(text)) continue;
      // The seed's full reset is the one permitted caller: it clears an empty
      // database before seeding, not a live one during operation.
      if (file.endsWith(join("lib", "db", "seed.ts"))) continue;
      offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
