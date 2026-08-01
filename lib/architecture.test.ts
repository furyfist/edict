import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE ARCHITECTURE, AS AN EXECUTABLE INVARIANT.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS
 *
 * The product's central claim is invariant #1: the language model can propose,
 * it can never authorize or execute. The runbook answers "what stops the agent
 * calling Prava?" with:
 *
 *     "lib/agent has no import path to lib/prava. It is a fact about the
 *      module graph, not a promise in a prompt."
 *
 * Until this file existed, that sentence was doing more work than it could
 * support. It was a fact about one commit, asserted by whoever last ran grep.
 * Nothing kept it true.
 *
 * Two ways it breaks, and neither is exotic:
 *
 *   Directly — someone adds an import under time pressure. Nothing fails. The
 *   build is green, the demo still runs, and the central claim is quietly
 *   false.
 *
 *   Transitively — and this is the one to worry about. `grep lib/prava
 *   lib/agent` proves there is no direct EDGE. It cannot prove there is no
 *   PATH. lib/contracts/enums.ts currently hand-maintains ACTIONS, EFFECTS and
 *   OUTCOMES as const arrays that duplicate the Prisma enums. The obvious
 *   future cleanup — "why are we maintaining these twice?" — is to import them
 *   from @prisma/client. One line, looks like tidying, passes review, and it
 *   hands lib/agent a transitive path to the database. The grep still comes
 *   back clean.
 *
 * So the boundary is checked here, transitively, by walking the real import
 * graph. A forbidden edge fails the build and names itself.
 * ---------------------------------------------------------------------------
 *
 * WHAT THIS DOES NOT DO: it does not stop someone deleting this file. Nothing
 * in a repository can. It converts a silent regression into a loud one — a
 * smoke alarm, not a lock. Removing the alarm is itself a visible act, which is
 * the whole difference between this and a convention.
 *
 * Type-only imports count. The claim is about the module graph, and `import
 * type` is still a coupling that invites a runtime import later.
 */

const LIB = resolve(process.cwd(), "lib");

// ---------------------------------------------------------------------------
// Graph construction
// ---------------------------------------------------------------------------

/** Every non-test source file under lib/, as posix-style paths from the repo root. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      sourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(name)) continue;
    // Tests legitimately reach across boundaries — the engine's own tests
    // import fixtures. They are not part of the shipped graph.
    if (/\.test\.tsx?$/.test(name)) continue;
    out.push(posix.join("lib", relative(LIB, full).split(/[\\/]/).join("/")));
  }
  return out;
}

const IMPORT = /(?:from\s*|import\s*|require\s*\(\s*)["']([^"']+)["']/g;

function specifiersIn(file: string): string[] {
  const source = readFileSync(resolve(process.cwd(), file), "utf8");
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT)) found.push(match[1]);
  return found;
}

const FILES = sourceFiles(LIB);
const FILE_SET = new Set(FILES);

/**
 * Resolves a specifier to a file in the graph, or returns the bare package name.
 *
 * Handles the `@/` path alias from tsconfig, because a forbidden edge written
 * as `@/lib/prava` is the same edge as `../prava`.
 */
function resolveSpecifier(fromFile: string, specifier: string): string {
  let target: string | null = null;

  if (specifier.startsWith("@/")) {
    target = specifier.slice(2);
  } else if (specifier.startsWith(".")) {
    target = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  } else {
    return `pkg:${specifier}`;
  }

  for (const candidate of [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
  ]) {
    if (FILE_SET.has(candidate)) return candidate;
  }

  // Outside lib/ (e.g. app/) or unresolvable. Not part of the graph we police.
  return `unresolved:${target}`;
}

const GRAPH = new Map<string, string[]>(
  FILES.map((file) => [
    file,
    specifiersIn(file).map((spec) => resolveSpecifier(file, spec)),
  ]),
);

/**
 * Every node reachable from a starting directory, with the path taken.
 *
 * Returns a map of node -> the chain that reached it, so a failure can print
 * the actual route rather than just asserting one exists.
 */
function reachableFrom(prefix: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue: Array<{ node: string; path: string[] }> = FILES.filter((f) =>
    f.startsWith(prefix),
  ).map((node) => ({ node, path: [node] }));

  for (const start of queue) seen.set(start.node, start.path);

  while (queue.length > 0) {
    const { node, path } = queue.shift()!;
    for (const next of GRAPH.get(node) ?? []) {
      if (seen.has(next)) continue;
      const nextPath = [...path, next];
      seen.set(next, nextPath);
      if (GRAPH.has(next)) queue.push({ node: next, path: nextPath });
    }
  }

  return seen;
}

function violations(
  from: string,
  forbidden: string[],
): Array<{ target: string; route: string }> {
  const reached = reachableFrom(from);
  const found: Array<{ target: string; route: string }> = [];

  for (const [node, path] of reached) {
    if (!forbidden.some((f) => node.startsWith(f))) continue;
    // A module trivially reaches itself; only cross-boundary routes count.
    if (node.startsWith(from)) continue;
    found.push({ target: node, route: path.join("\n      -> ") });
  }

  return found;
}

// ---------------------------------------------------------------------------
// The invariants
// ---------------------------------------------------------------------------

describe("the module graph enforces the closing invariants", () => {
  it("finds a graph to check at all", () => {
    // Guards against the worst failure mode of a test like this: a resolver
    // bug makes the graph empty and every assertion below passes vacuously.
    expect(FILES.length).toBeGreaterThan(20);
    expect(FILES).toContain("lib/agent/index.ts");
    expect(FILES).toContain("lib/prava/index.ts");
    expect(GRAPH.get("lib/agent/index.ts")).toContain("lib/agent/llm.ts");
  });

  it("invariant 1 — lib/agent has no path to money, authority, or the record", () => {
    // The agent proposes. It cannot execute (prava), cannot decide (engine),
    // cannot record (ledger), cannot route an outcome, and cannot read the
    // database directly — its whole world is the evidence bundle it is handed.
    const found = violations("lib/agent/", [
      "lib/prava/",
      "lib/ledger/",
      "lib/policy/engine/",
      "lib/outcome/",
      "lib/db/",
      "pkg:@prisma/client",
    ]);

    expect(
      found.map((v) => `\n  lib/agent reaches ${v.target} via:\n      ${v.route}`).join(""),
    ).toBe("");
  });

  it("invariant 2 — lib/policy/engine stays pure", () => {
    // The engine is the only component permitted to say yes, and its purity is
    // what makes "the model is never the last line of defense" true rather than
    // a slogan. It may read lib/contracts, which is types and constants only.
    const reached = reachableFrom("lib/policy/engine/");

    const impure = [...reached.keys()].filter(
      (node) =>
        !node.startsWith("lib/policy/engine/") &&
        !node.startsWith("lib/contracts") &&
        !node.startsWith("unresolved:"),
    );

    expect(impure).toEqual([]);
  });

  it("lib/contracts imports nothing at all", () => {
    // Load-bearing for both invariants above: contracts is the single outward
    // edge each of them is allowed, so it has to stay a leaf. This is the exact
    // line the @prisma/client "cleanup" would cross.
    const reached = reachableFrom("lib/contracts/");

    const outward = [...reached.keys()].filter(
      (node) => !node.startsWith("lib/contracts"),
    );

    expect(outward).toEqual([]);
  });

  it("lib/prava is the only module that talks to Prava", () => {
    // The single payment boundary, stated as a graph property rather than a
    // convention. One module can move money, and everything else has to ask it.
    const callers = FILES.filter(
      (file) =>
        !file.startsWith("lib/prava/") &&
        specifiersIn(file).some((spec) => /(^|\/)prava(\/|$)/.test(spec)),
    );

    const viaIndex = callers.filter(
      (file) =>
        !specifiersIn(file).some((spec) =>
          /prava\/(http|prava|mock|mandates|store)/.test(spec),
        ),
    );

    // Everyone outside lib/prava goes through its index, never its internals.
    expect(callers.sort()).toEqual(viaIndex.sort());
  });
});
