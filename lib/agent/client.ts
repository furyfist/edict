import OpenAI from "openai";

/**
 * The single configured entry point to the language model.
 *
 * Both LLM surfaces — the proposer and the policy compiler — go through here so
 * that temperature, timeout, and model selection are decided in one place
 * rather than at each call site.
 *
 * Temperature is fixed at 0 IN CODE, not in configuration. A model that reasons
 * about money should not become more creative because someone edited an
 * environment variable.
 */

const DEFAULT_MODEL = "gpt-4o";
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 0; // Retries are the caller's decision, never the SDK's.

export const TEMPERATURE = 0;

/**
 * Optional base-URL override, so any OpenAI-compatible provider works without
 * touching the agent or the compiler — both call through this one module.
 *
 * Set OPENAI_BASE_URL to e.g. https://api.groq.com/openai/v1 and point
 * OPENAI_MODEL at a model that provider serves. The provider that is actually
 * live is recorded on every ledger entry via `decidedBy.modelId`, so a swap is
 * never invisible in the record.
 */
export function baseUrl(): string | undefined {
  return process.env.OPENAI_BASE_URL || undefined;
}

export type LlmFailure =
  | { kind: "UNAVAILABLE"; message: string }
  | { kind: "MALFORMED"; message: string };

export type LlmResult =
  | { ok: true; content: string }
  | { ok: false; failure: LlmFailure };

let client: OpenAI | null = null;

export function modelId(): string {
  return process.env.OPENAI_MODEL ?? DEFAULT_MODEL;
}

export function isConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: baseUrl(),
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return client;
}

/**
 * One completion, returned as raw text.
 *
 * `jsonSchema` uses structured outputs so the model is constrained to the shape
 * at generation time. That does not remove the need for validation on receipt —
 * the schema constrains structure, not meaning, and a well-formed proposal for
 * the wrong vendor is still something we refuse.
 */
export async function complete(input: {
  system: string;
  user: string;
  schemaName: string;
  jsonSchema: Record<string, unknown>;
}): Promise<LlmResult> {
  if (!isConfigured()) {
    return {
      ok: false,
      failure: {
        kind: "UNAVAILABLE",
        message: "OPENAI_API_KEY is not set.",
      },
    };
  }

  try {
    const response = await getClient().chat.completions.create({
      model: modelId(),
      temperature: TEMPERATURE,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: input.schemaName,
          strict: true,
          schema: input.jsonSchema,
        },
      },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return {
        ok: false,
        failure: { kind: "MALFORMED", message: "Model returned no content." },
      };
    }

    return { ok: true, content };
  } catch (error) {
    // Unreachable, timed out, rate limited, or refused. All are UNAVAILABLE:
    // the caller halts rather than proceeding on a partial picture.
    return {
      ok: false,
      failure: {
        kind: "UNAVAILABLE",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

/** Test seam. */
export function __resetClient() {
  client = null;
}
