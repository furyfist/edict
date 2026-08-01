/**
 * THE SIMULATION PLANE.
 *
 * Pure by construction and pure by enforcement: everything under `lib/simulate`
 * imports `lib/policy/engine` and `lib/contracts` and nothing else, checked by
 * `lib/architecture.test.ts`. Callers do the I/O — fetching bundles, hashing a
 * preview, persisting a record — and hand this module plain values.
 *
 * This plane cannot touch money. It has no path to `lib/prava`, no path to the
 * ledger, and no way to create authority. It only ever answers the question
 * "what would the engine have said?"
 */

export { replay, countByEffect } from "./core";
export type {
  Replay,
  Scenario,
  ScenarioOrigin,
  ScenarioVerdict,
} from "./core";

export { BATTERY_VERSION, EDGE_KINDS, buildBattery } from "./battery";
export type { Battery } from "./battery";

export { groupByEffect, summarize } from "./preview";
export type { Preview, PreviewRow } from "./preview";

export { diffReplays } from "./diff";
export type { BehavioralDiff, VerdictChange, VerdictSide } from "./diff";
