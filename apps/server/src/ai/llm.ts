import type { z } from 'zod'

/**
 * One LLM call. `task` names the kind of call (e.g. `review-task`,
 * `lecture-summary`, `plan-autofill`): the fake client picks its fixture by
 * it, and the live client logs it next to the cost.
 */
export interface LlmRequest {
  task: string
  system: string
  prompt: string
  /**
   * Structured data the prompt was built from (transcript moments, to-dos...).
   * Live clients ignore it - it is already rendered into `prompt` - but fake
   * fixtures read it to return plausible, content-aware output.
   */
  input?: Record<string, unknown>
  /** Capped by the live client; see MAX_TOKENS_CAP in ./openrouter.ts. */
  maxTokens?: number
}

export interface LlmJsonRequest<T> extends LlmRequest {
  /**
   * Output schema. Sent to the provider as a strict JSON schema and used to
   * validate the reply, so use `.nullable()` rather than `.optional()` for
   * fields the model may leave empty (strict mode requires every key).
   */
  schema: z.ZodType<T>
}

/**
 * The only way server code talks to a language model. Executors and routers
 * receive one through `AiDeps` (./deps.ts); nothing constructs a provider
 * client directly, so tests always get the fake.
 */
export interface LlmClient {
  name: string
  /** Returns the reply parsed and validated against `schema`. */
  complete<T>(req: LlmJsonRequest<T>): Promise<T>
  /** Returns the reply as plain text. */
  complete(req: LlmRequest): Promise<string>
}

/** Raw transport: returns the model's reply text for a request. */
export type LlmTransport = (req: LlmRequest & { schema?: z.ZodType<unknown> }) => Promise<string>

/**
 * Builds an `LlmClient` from a transport, so live and fake clients share the
 * same JSON parsing and schema validation (a fixture that drifts from its
 * schema fails the same way a misbehaving model would).
 */
export function createLlmClient(name: string, transport: LlmTransport): LlmClient {
  async function complete(req: LlmRequest & { schema?: z.ZodType<unknown> }): Promise<unknown> {
    const text = await transport(req)
    if (!req.schema) return text

    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`LLM task "${req.task}" (${name}) returned invalid JSON: ${text.slice(0, 200)}`)
    }
    const parsed = req.schema.safeParse(json)
    if (!parsed.success) {
      throw new Error(`LLM task "${req.task}" (${name}) reply did not match its schema: ${parsed.error.message}`)
    }
    return parsed.data
  }

  return { name, complete: complete as LlmClient['complete'] }
}
