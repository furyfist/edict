import { complete, modelId } from "./client";
import { PROMPT_VERSION, SYSTEM_PROMPT, buildUserPrompt } from "./prompt";
import { PROPOSAL_JSON_SCHEMA, parseAndValidate } from "./validate";
import type { Agent, AgentInput, AgentResult } from "./types";

/**
 * The real proposer.
 *
 * Slots in behind the stub's signature — the swap touches `lib/agent/index.ts`
 * and nothing else in the codebase. If it misbehaves on demo day, one line
 * returns you to the stub.
 *
 * Note what happens on failure, and what does not:
 *
 *   UNAVAILABLE → the tick halts. Nothing is charged on a partial picture.
 *   MALFORMED   → a refusal is recorded, and the model is NOT asked again.
 *
 * There is no retry with a softened prompt. A model that has already ignored
 * the contract has told you something, and the answer is not to negotiate.
 */
export function createLlmAgent(): Agent {
  return {
    name: "llm",
    modelId: modelId(),
    promptVersion: PROMPT_VERSION,
    stubbed: false,

    async propose(input: AgentInput): Promise<AgentResult> {
      const result = await complete({
        system: SYSTEM_PROMPT,
        user: buildUserPrompt(input),
        schemaName: "renewal_proposal",
        jsonSchema: PROPOSAL_JSON_SCHEMA,
      });

      if (!result.ok) {
        return {
          ok: false,
          reason: result.failure.kind,
          message: result.failure.message,
        };
      }

      const validated = parseAndValidate(result.content, input.evidence);
      if (!validated.ok) {
        return { ok: false, reason: "MALFORMED", message: validated.message };
      }

      return { ok: true, proposal: validated.proposal };
    },
  };
}
