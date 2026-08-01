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
  it("nothing writes capCents on an existing mandate row outside the mirror", () => {
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
        /db\.mandate\.update\(\{[\s\S]{0,600}?\}\)/g,
      );
      if (!updates) continue;

      for (const block of updates) {
        if (!block.includes("capCents")) continue;
        // Permitted: the mirror, which writes what the network said.
        const isMirror = file.endsWith("mandates.ts");
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

  it("the ceiling raise path only records passkeyAt after Prava confirms", () => {
    const text = readFileSync(
      join(ROOT, "lib/outcome/approvals.ts"),
      "utf8",
    );
    // recordPasskey is the only writer of passkeyAt, and it only accepts
    // CEILING_RAISE approvals — that guard is the shape a bypass would remove.
    expect(text).toMatch(
      /approval\.type !== "CEILING_RAISE"[\s\S]{0,40}return false/,
    );
    expect(text).toContain("data: { passkeyAt: input.clock }");
  });

  it("has no override, force, or bypass parameter anywhere in approvals", () => {
    for (const file of sourcesUnder(join(ROOT, "lib/outcome"))) {
      if (!file.endsWith("approvals.ts")) continue;
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
  it("reports requiresPasskey but never grants it itself", () => {
    const text = readFileSync(join(ROOT, "app/api/approvals/route.ts"), "utf8");
    expect(text).toMatch(/requiresPasskey/);
    // Only the passkey route is allowed to open a mandate setup or record a
    // completed ceremony. If either call appeared here, approving in-app
    // could grant new authority directly.
    expect(text).not.toContain("openMandateSetup");
    expect(text).not.toContain("recordPasskey");
  });

  it("keeps the approve and passkey routes as separate files", () => {
    // One handler with a branch would be the collapse this test exists to
    // prevent. Two files means a reviewer sees two things.
    const approve = join(ROOT, "app/api/approvals/route.ts");
    const passkey = join(ROOT, "app/api/approvals/passkey/route.ts");
    expect(statSync(approve).isFile()).toBe(true);
    expect(statSync(passkey).isFile()).toBe(true);
  });
});

describe("expiry is never revived", () => {
  it("has no path that moves an approval out of EXPIRED", () => {
    const offenders: string[] = [];

    for (const file of sourcesUnder(join(ROOT, "lib/outcome"))) {
      if (!file.endsWith("approvals.ts")) continue;
      const text = readFileSync(file, "utf8");

      // Creation (`db.approval.create`) legitimately writes status: "PENDING"
      // once. Reviving would mean an `update`/`updateMany` call writing a
      // non-terminal status back onto an existing row — no such write exists.
      const updates =
        text.match(/db\.approval\.updateMany?\(\{[\s\S]{0,600}?\}\)/g) ?? [];
      for (const block of updates) {
        const dataSection = block.slice(block.indexOf("data:"));
        if (/status:\s*["']PENDING["']/.test(dataSection)) {
          offenders.push(file);
        }
      }

      expect(text).not.toContain("unexpire");
      expect(text).not.toContain("reviveApproval");
    }

    expect(
      offenders,
      `these updates write status back to PENDING: ${offenders.join(", ")}`,
    ).toEqual([]);
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
