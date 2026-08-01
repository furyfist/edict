import { isConfigured } from "./client";
import { createLlmAgent } from "./llm";
import { createStubAgent } from "./stub";
import type { Agent } from "./types";

/**
 * The active agent.
 *
 * The real proposer when an API key is present, the deterministic stub
 * otherwise. Falling back rather than throwing is deliberate: an unconfigured
 * environment should still run the full pipeline, and on demo day a rate limit
 * or an outage degrades to a working system instead of a broken one.
 *
 * Which one ran is recorded in every ledger entry's `decidedBy.stubbed` field,
 * so the fallback is never invisible.
 */

let agent: Agent | null = null;

export function activeAgent(): Agent {
  if (!agent) {
    agent = isConfigured() ? createLlmAgent() : createStubAgent();
  }
  return agent;
}

/** Test seam, and the demo-day escape hatch back to the stub. */
export function __setAgent(next: Agent | null) {
  agent = next;
}

export { createStubAgent } from "./stub";
export { createLlmAgent } from "./llm";
export { validateProposal, parseAndValidate } from "./validate";
export { isConfigured, modelId } from "./client";
export type { Agent, AgentInput, AgentResult } from "./types";
