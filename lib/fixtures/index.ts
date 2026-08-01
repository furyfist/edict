/**
 * Fixture generators for the five contracts.
 *
 * Purpose: the interface workstream builds every page against these on Day 1,
 * before a backend exists, and engine tests construct situations without a
 * database. Nothing here is random — identical calls return identical values.
 *
 * Fixtures are development-only. No production code path imports this module.
 */

export * from "./evidence";
export * from "./proposal";
export * from "./policy";
export * from "./ledger";
