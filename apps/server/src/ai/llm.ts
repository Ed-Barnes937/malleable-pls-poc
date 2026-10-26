import { z } from 'zod'

export type JsonSchema = Record<string, unknown>

/**
 * Everything about one kind of LLM call, type-checked together: the input it
 * takes, the prompt built from it, the output schema, and the deterministic
 * fake used in tests and mock runs. Create with `defineLlmTask`.
 */
export interface LlmTaskDefinition<I, O> {
  /** Stable name, e.g. `review-task`; logged with the cost of live calls. */
  name: string
  system: string
  buildPrompt(input: I): string
  /**
   * Output schema. Sent to the provider as a strict JSON schema, so the root
   * must be an object and every field required: use `.nullable()`, not
   * `.optional()`. For plain text, wrap it (`z.object({ text: z.string() })`).
   * `defineLlmTask` rejects schemas strict mode would reject.
   */
  schema: z.ZodType<O>
  /**
   * Fake reply for mock mode. Deterministic, and derived from `input` (the
   * transcript moment, the to-do titles...) so mock screenshots look real.
   * Validated against `schema` like a live reply.
   */
  fake(input: I): O
  /** Capped by the live client; see MAX_TOKENS_CAP in ./openrouter.ts. */
  maxTokens?: number
}

export interface LlmTask<I, O> extends LlmTaskDefinition<I, O> {
  /** The strict JSON schema sent to the provider, checked at definition time. */
  readonly jsonSchema: JsonSchema
}

/**
 * Declares an LLM task. Throws at definition (module load, so in any test that
 * imports it) if the schema would be rejected by strict structured output.
 */
export function defineLlmTask<I, O>(definition: LlmTaskDefinition<I, O>): LlmTask<I, O> {
  let jsonSchema: JsonSchema
  try {
    jsonSchema = toStrictJsonSchema(definition.schema)
  } catch (err) {
    throw new Error(`LLM task "${definition.name}": ${(err as Error).message}`)
  }
  return { ...definition, jsonSchema }
}

/**
 * The only way server code talks to a language model. Executors and routers
 * receive one through `AiDeps` (./deps.ts); nothing constructs a provider
 * client directly, so tests always get the fake.
 */
export interface LlmClient {
  name: string
  /** Runs the task on `input` and returns its reply, validated against the task's schema. */
  run<I, O>(task: LlmTask<I, O>, input: I): Promise<O>
}

export interface LlmTransportRequest {
  task: LlmTask<unknown, unknown>
  input: unknown
  prompt: string
}

/** Raw transport: returns the model's reply text (JSON) for a request. */
export type LlmTransport = (req: LlmTransportRequest) => Promise<string>

/**
 * Builds an `LlmClient` from a transport, so live and fake clients share the
 * same JSON parsing and schema validation (a fake that drifts from its schema
 * fails the same way a misbehaving model would).
 */
export function createLlmClient(name: string, transport: LlmTransport): LlmClient {
  return {
    name,
    async run<I, O>(task: LlmTask<I, O>, input: I): Promise<O> {
      const text = await transport({
        task: task as LlmTask<unknown, unknown>,
        input,
        prompt: task.buildPrompt(input),
      })

      let json: unknown
      try {
        json = JSON.parse(text)
      } catch {
        throw new Error(`LLM task "${task.name}" (${name}) returned invalid JSON: ${text.slice(0, 200)}`)
      }
      const parsed = task.schema.safeParse(json)
      if (!parsed.success) {
        throw new Error(`LLM task "${task.name}" (${name}) reply did not match its schema: ${parsed.error.message}`)
      }
      return parsed.data
    },
  }
}

// ---------------------------------------------------------------------------
// Strict structured output
// ---------------------------------------------------------------------------

/**
 * Keywords strict structured output accepts across providers (OpenAI's subset
 * is the narrowest we route to). Anything else, e.g. `default`, `minLength`,
 * `format`, is rejected up front instead of failing only against the live API.
 */
const STRICT_KEYWORDS = new Set([
  'type', 'properties', 'required', 'additionalProperties', 'items',
  'enum', 'const', 'anyOf', 'description', 'title', '$ref', '$defs', 'definitions',
])

/**
 * Throws, naming the offending path, unless `schema` is valid for strict mode:
 * object root; every object has `additionalProperties: false` and lists all of
 * its properties in `required`; only STRICT_KEYWORDS are used.
 */
export function assertStrictSchema(schema: JsonSchema): void {
  if (schema.type !== 'object') {
    throw new Error(`strict output schema root must be an object, got ${JSON.stringify(schema.type ?? null)}`)
  }
  visit(schema, '$')

  function visit(node: unknown, at: string): void {
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return
    const obj = node as JsonSchema

    for (const key of Object.keys(obj)) {
      if (!STRICT_KEYWORDS.has(key)) throw new Error(`unsupported keyword "${key}" at ${at} for strict output`)
    }

    const isObject = obj.type === 'object' || (Array.isArray(obj.type) && obj.type.includes('object'))
    if (isObject || obj.properties) {
      if (obj.additionalProperties !== false) {
        throw new Error(`object at ${at} must set additionalProperties: false for strict output`)
      }
      const keys = Object.keys((obj.properties ?? {}) as JsonSchema)
      const required = new Set((obj.required ?? []) as string[])
      const missing = keys.filter((k) => !required.has(k))
      if (missing.length > 0) {
        throw new Error(
          `field(s) ${missing.join(', ')} at ${at} must be required for strict output - use .nullable() instead of .optional()`,
        )
      }
      for (const key of keys) visit((obj.properties as JsonSchema)[key], `${at}.${key}`)
    }

    if (obj.items) visit(obj.items, `${at}[]`)
    if (Array.isArray(obj.anyOf)) obj.anyOf.forEach((s, i) => visit(s, `${at}.anyOf[${i}]`))
    for (const defsKey of ['$defs', 'definitions']) {
      const defs = obj[defsKey] as JsonSchema | undefined
      if (defs) for (const [name, s] of Object.entries(defs)) visit(s, `${at}.${defsKey}.${name}`)
    }
  }
}

/**
 * Converts a zod schema to the JSON schema sent for strict output and asserts
 * it is valid. Drops the `$schema` marker and the +-MAX_SAFE_INTEGER bounds
 * zod adds for `.int()`, so integers work.
 */
export function toStrictJsonSchema(schema: z.ZodType<unknown>): JsonSchema {
  const { $schema: _marker, ...json } = z.toJSONSchema(schema) as JsonSchema
  stripSafeIntegerBounds(json)
  assertStrictSchema(json)
  return json
}

function stripSafeIntegerBounds(node: unknown): void {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach(stripSafeIntegerBounds)
    return
  }
  const obj = node as JsonSchema
  if (obj.type === 'integer') {
    if (obj.minimum === Number.MIN_SAFE_INTEGER) delete obj.minimum
    if (obj.maximum === Number.MAX_SAFE_INTEGER) delete obj.maximum
  }
  Object.values(obj).forEach(stripSafeIntegerBounds)
}
