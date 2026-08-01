/**
 * The one configured entry point to the language model.
 *
 * Both model surfaces — the agent proposer and the policy compiler — go
 * through this client. One entry point means one place where the timeout, the
 * determinism settings, and the failure taxonomy are decided, rather than two
 * call sites that drift apart.
 *
 * Every failure is a typed value. Nothing here throws for an unreachable model
 * or a slow one: an unreachable model is an ordinary outcome that the pipeline
 * adjudicates like any other, and a thrown exception at this boundary would
 * turn that into a crash.
 *
 * This module imports only `lib/contracts`. It is inside `lib/agent`, and
 * `lib/agent` has no path to money.
 */

const DEFAULT_MODEL = "claude-opus-5";

/** Bounded. A model that has not answered by now is treated as unreachable. */
const TIMEOUT_MS = 20_000;

/**
 * Determinism. Claude Opus 5 rejects `temperature`, `top_p`, and `top_k`
 * outright, so determinism is requested through `effort` and through prompts
 * that leave little room for variance rather than through a sampling knob.
 *
 * This is worth being clear about: the model is not deterministic and the
 * system does not depend on it being deterministic. Determinism lives in the
 * policy engine, which is a pure function. The model only proposes.
 */
const EFFORT = "low" as const;

export const LLM_FAILURES = ["MODEL_UNREACHABLE", "MODEL_TIMEOUT"] as const;
export type LlmFailureReason = (typeof LLM_FAILURES)[number];

export type LlmResult =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: LlmFailureReason; detail: string };

export interface LlmRequest {
  system: string;
  prompt: string;
  maxTokens?: number;
  /**
   * JSON Schema the response must conform to. When present the model is asked
   * for structured output, which removes a whole class of parse failures — but
   * the validator downstream still runs. Structured output makes malformed
   * responses rarer; it does not make them impossible, and the boundary that
   * turns a bad response into a refusal is not allowed to depend on a
   * provider feature working perfectly.
   */
  schema?: Record<string, unknown>;
}

export function isModelConfigured(): boolean {
  return (
    process.env.AGENT_MODE === "live" && Boolean(process.env.ANTHROPIC_API_KEY)
  );
}

/**
 * Call the model. Returns text or a typed failure — never throws.
 *
 * The request is issued over plain fetch rather than through an SDK. The
 * payload is small, the response shape is stable, and one fewer dependency in
 * the module that talks to the model is worth more here than the ergonomics.
 */
export async function complete(request: LlmRequest): Promise<LlmResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.AGENT_MODEL || DEFAULT_MODEL;

  if (!apiKey) {
    return {
      ok: false,
      reason: "MODEL_UNREACHABLE",
      detail: "No ANTHROPIC_API_KEY is configured.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body: Record<string, unknown> = {
      model,
      max_tokens: request.maxTokens ?? 1024,
      system: request.system,
      output_config: { effort: EFFORT },
      messages: [{ role: "user", content: request.prompt }],
    };

    if (request.schema) {
      (body.output_config as Record<string, unknown>).format = {
        type: "json_schema",
        schema: request.schema,
      };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return {
        ok: false,
        reason: "MODEL_UNREACHABLE",
        detail: truncate(`HTTP ${response.status}: ${detail}`),
      };
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
    };

    // A refusal is not a crash. It produces no usable proposal, which the
    // validator downstream turns into an escalation.
    if (payload.stop_reason === "refusal") {
      return {
        ok: false,
        reason: "MODEL_UNREACHABLE",
        detail: "The model declined to answer.",
      };
    }

    const text = (payload.content ?? [])
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("");

    return { ok: true, text, model };
  } catch (error) {
    const aborted =
      error instanceof Error &&
      (error.name === "AbortError" || error.name === "TimeoutError");
    return {
      ok: false,
      reason: aborted ? "MODEL_TIMEOUT" : "MODEL_UNREACHABLE",
      detail: truncate(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Model output reaches the ledger. It is bounded and escaped before it does. */
export function truncate(value: string, limit = 300): string {
  const flattened = value.replace(/\s+/g, " ").trim();
  return flattened.length <= limit
    ? flattened
    : `${flattened.slice(0, limit)}…`;
}
