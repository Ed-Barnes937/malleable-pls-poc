import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { z } from 'zod'
import {
  createOpenRouterLlmClient,
  createOpenRouterWhisperTranscriber,
  mapWhisperSegments,
  MAX_TOKENS_CAP,
  WHISPER_MODEL,
} from './openrouter'
import whisperFixture from './__fixtures__/whisper-verbose.json'

// No network: every test injects `fetch`.

function fakeFetch(reply: unknown, status = 200) {
  return vi.fn<typeof fetch>(async () => new Response(JSON.stringify(reply), { status }))
}

function sentBody(fetchMock: ReturnType<typeof fakeFetch>) {
  const [url, init] = fetchMock.mock.calls[0]
  return { url, init: init!, body: JSON.parse(init!.body as string) }
}

describe('mapWhisperSegments', () => {
  it('maps verbose_json segments (seconds) to transcript segments (ms), dropping blanks', () => {
    expect(mapWhisperSegments(whisperFixture)).toEqual([
      { startMs: 0, endMs: 6480, text: 'Today we\'re looking at mitochondrial DNA.', speaker: 'Speaker' },
      { startMs: 6480, endMs: 14200, text: 'Unlike nuclear DNA, it is inherited only from the mother.', speaker: 'Speaker' },
    ])
  })

  it('falls back to one segment from the full text when there are no segments', () => {
    expect(mapWhisperSegments({ text: ' Hello there. ', duration: 2.5 })).toEqual([
      { startMs: 0, endMs: 2500, text: 'Hello there.', speaker: 'Speaker' },
    ])
  })

  it('returns nothing for silence', () => {
    expect(mapWhisperSegments({ text: '', segments: [] })).toEqual([])
  })
})

describe('createOpenRouterWhisperTranscriber', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'whisper-test-'))
    await writeFile(path.join(dir, 'lecture.webm'), Buffer.from('fake-audio'))
    await writeFile(path.join(dir, 'lecture.flac'), Buffer.from('fake-audio'))
  })
  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('posts base64 audio with the agreed Whisper request and maps the reply', async () => {
    const fetchMock = fakeFetch(whisperFixture)
    const transcriber = createOpenRouterWhisperTranscriber({ apiKey: 'test-key', fetch: fetchMock })

    const segments = await transcriber.transcribe(path.join(dir, 'lecture.webm'))

    const { url, init, body } = sentBody(fetchMock)
    expect(url).toBe('https://openrouter.ai/api/v1/audio/transcriptions')
    expect(init.method).toBe('POST')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key')
    expect(body).toEqual({
      model: WHISPER_MODEL,
      input_audio: { data: Buffer.from('fake-audio').toString('base64'), format: 'webm' },
      language: 'en',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
      provider: { order: ['groq'], allow_fallbacks: false },
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(segments).toHaveLength(2)
  })

  it('rejects unsupported formats without calling the provider', async () => {
    const fetchMock = fakeFetch(whisperFixture)
    const transcriber = createOpenRouterWhisperTranscriber({ apiKey: 'k', fetch: fetchMock })
    await expect(transcriber.transcribe(path.join(dir, 'lecture.flac'))).rejects.toThrow('Unsupported audio format')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces provider errors', async () => {
    const transcriber = createOpenRouterWhisperTranscriber({
      apiKey: 'k',
      fetch: fakeFetch({ error: { message: 'no provider' } }, 404),
    })
    await expect(transcriber.transcribe(path.join(dir, 'lecture.webm'))).rejects.toThrow('404')
  })
})

describe('createOpenRouterLlmClient', () => {
  const completion = (content: string | null) => ({ choices: [{ message: { content } }], usage: { cost: 0.0002 } })

  it('sends a capped chat completion and returns text', async () => {
    const fetchMock = fakeFetch(completion('A summary.'))
    const llm = createOpenRouterLlmClient({ apiKey: 'test-key', model: 'some/model', fetch: fetchMock })

    const reply = await llm.complete({ task: 'lecture-summary', system: 'sys', prompt: 'p', maxTokens: 100_000 })

    expect(reply).toBe('A summary.')
    const { url, init, body } = sentBody(fetchMock)
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(body.model).toBe('some/model')
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'p' },
    ])
    expect(body.max_tokens).toBe(MAX_TOKENS_CAP)
    expect(body.response_format).toBeUndefined()
  })

  it('requests strict structured output and validates the reply', async () => {
    const fetchMock = fakeFetch(completion('{"title":"Review: maternal inheritance"}'))
    const llm = createOpenRouterLlmClient({ apiKey: 'k', fetch: fetchMock })
    const schema = z.object({ title: z.string() })

    const reply = await llm.complete({ task: 'review task', system: 's', prompt: 'p', schema })

    expect(reply).toEqual({ title: 'Review: maternal inheritance' })
    const { body } = sentBody(fetchMock)
    expect(body.response_format).toEqual({
      type: 'json_schema',
      json_schema: {
        name: 'review_task',
        strict: true,
        schema: {
          type: 'object',
          properties: { title: { type: 'string' } },
          required: ['title'],
          additionalProperties: false,
        },
      },
    })
    expect(body.provider).toEqual({ require_parameters: true })
  })

  it('rejects replies that are not valid JSON or do not match the schema', async () => {
    const schema = z.object({ title: z.string() })
    const notJson = createOpenRouterLlmClient({ apiKey: 'k', fetch: fakeFetch(completion('sure! here you go')) })
    await expect(notJson.complete({ task: 't', system: 's', prompt: 'p', schema })).rejects.toThrow('invalid JSON')

    const wrongShape = createOpenRouterLlmClient({ apiKey: 'k', fetch: fakeFetch(completion('{"name":"x"}')) })
    await expect(wrongShape.complete({ task: 't', system: 's', prompt: 'p', schema })).rejects.toThrow('did not match')
  })

  it('surfaces HTTP errors and empty content', async () => {
    const failing = createOpenRouterLlmClient({ apiKey: 'k', fetch: fakeFetch({ error: 'rate limited' }, 429) })
    await expect(failing.complete({ task: 't', system: 's', prompt: 'p' })).rejects.toThrow('429')

    const empty = createOpenRouterLlmClient({ apiKey: 'k', fetch: fakeFetch(completion(null)) })
    await expect(empty.complete({ task: 't', system: 's', prompt: 'p' })).rejects.toThrow('no content')
  })
})
