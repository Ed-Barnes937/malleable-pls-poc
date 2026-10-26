import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { assertStrictSchema, defineLlmTask, toStrictJsonSchema } from './llm'

describe('toStrictJsonSchema', () => {
  it('accepts objects with required, nullable, enum, array, nested and integer fields', () => {
    const schema = z.object({
      title: z.string().describe('Short task title'),
      minutes: z.number().int(),
      note: z.string().nullable(),
      kind: z.enum(['review', 'practice']),
      steps: z.array(z.object({ text: z.string() })),
    })
    expect(toStrictJsonSchema(schema)).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short task title' },
        // .int()'s +-MAX_SAFE_INTEGER bounds are stripped.
        minutes: { type: 'integer' },
        note: { type: ['string', 'null'] },
        kind: { type: 'string', enum: ['review', 'practice'] },
        steps: {
          type: 'array',
          items: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false,
          },
        },
      },
      required: ['title', 'minutes', 'note', 'kind', 'steps'],
      additionalProperties: false,
    })
  })

  it.each([
    ['an optional field', z.object({ a: z.string(), b: z.string().optional() }), 'b at $ must be required'],
    ['a nested optional field', z.object({ a: z.object({ b: z.number().optional() }) }), 'b at $.a must be required'],
    ['a top-level array', z.array(z.string()), 'root must be an object'],
    ['a top-level string', z.string(), 'root must be an object'],
    ['a default', z.object({ a: z.string().default('x') }), 'unsupported keyword "default" at $.a'],
    ['a length constraint', z.object({ a: z.string().min(3) }), 'unsupported keyword "minLength" at $.a'],
    ['a passthrough object', z.object({ a: z.string() }).passthrough(), 'additionalProperties: false'],
    ['a record', z.object({ a: z.record(z.string(), z.string()) }), '$.a'],
    ['a nullable object with an optional field', z.object({ a: z.object({ b: z.string().optional() }).nullable() }), 'b at $.a'],
  ])('rejects %s', (_label, schema, message) => {
    expect(() => toStrictJsonSchema(schema as z.ZodType<unknown>)).toThrow(message)
  })
})

describe('assertStrictSchema', () => {
  it('checks objects inside anyOf and $defs', () => {
    expect(() => assertStrictSchema({
      type: 'object',
      properties: { a: { anyOf: [{ type: 'object', properties: { b: { type: 'string' } }, additionalProperties: false }] } },
      required: ['a'],
      additionalProperties: false,
    })).toThrow('b at $.a.anyOf[0] must be required')

    expect(() => assertStrictSchema({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
      $defs: { Item: { type: 'object', properties: {}, additionalProperties: true } },
    })).toThrow('$.$defs.Item must set additionalProperties: false')
  })
})

describe('defineLlmTask', () => {
  it('rejects a non-strict schema at definition time, naming the task', () => {
    expect(() => defineLlmTask({
      name: 'loose',
      system: 's',
      buildPrompt: () => 'p',
      schema: z.object({ a: z.string().optional() }),
      fake: () => ({}),
    })).toThrow('LLM task "loose": field(s) a at $ must be required')
  })

  it('attaches the strict JSON schema', () => {
    const task = defineLlmTask({
      name: 'ok',
      system: 's',
      buildPrompt: () => 'p',
      schema: z.object({ a: z.string() }),
      fake: () => ({ a: 'x' }),
    })
    expect(task.jsonSchema).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
      additionalProperties: false,
    })
  })
})
