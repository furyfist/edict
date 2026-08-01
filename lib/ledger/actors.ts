import type { Actor } from "../contracts";

/**
 * The actors a ledger entry can name.
 *
 * Four separate attributions on every entry is the product. Holding the actors
 * as constants rather than composing strings at each call site is what keeps
 * "who authorized this" from quietly becoming "whoever wrote this line".
 */

export const AGENT: Actor = {
  id: "agent:spend-guardian",
  label: "Spend Guardian agent",
  kind: "AGENT",
};

export const ENGINE: Actor = {
  id: "engine:policy",
  label: "Policy engine",
  kind: "ENGINE",
};

export const NETWORK: Actor = {
  id: "prava",
  label: "Prava",
  kind: "NETWORK",
};

export const TICK: Actor = {
  id: "system:tick",
  label: "Tick runner",
  kind: "SYSTEM",
};

/** Used when nothing executed — a refusal moved no money, so nobody executed. */
export const NOBODY: Actor = {
  id: "system:none",
  label: "Nobody — no execution occurred",
  kind: "SYSTEM",
};

export function human(id: string, label: string): Actor {
  return { id, label, kind: "HUMAN" };
}
