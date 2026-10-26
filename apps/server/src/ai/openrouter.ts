import { readFile, stat } from 'fs/promises'
import path from 'path'
import { z } from 'zod'
import { createLlmClient, type LlmClient } from './llm'
import type { TranscribedSegment, Transcriber } from './transcriber'

// Live OpenRouter clients. Only `createAiDeps` (./deps.ts) constructs these,
// and only when AI_MODE=live and OPENROUTER_API_KEY are both set. Tests cover
// them with an injected `fetch`, never the network.

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

export const DEFAULT_LLM_MODEL = 'openai/gpt-4o-mini'
const DEFAULT_MAX_TOKENS = 1024
export const MAX_TOKENS_CAP = 4096
const LLM_TIMEOUT_MS = 30_000

export const WHISPER_MODEL = 'openai/whisper-large-v3-turbo'
const TRANSCRIBE_TIMEOUT_MS = 120_000

type Fetch = typeof globalThis.fetch

interface OpenRouterOptions {
  apiKey: string
  fetch?: Fetch
}

async function postJson(
  fetchImpl: Fetch,
  apiKey: string,
  endpoint: string,
  body: unknown,
  timeoutMs: number,
): Promise<unknown> {
  const res = await fetchImpl(`${OPENROUTER_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).slice(0, 500)
    throw new Error(`OpenRouter ${endpoint} failed: ${res.status} ${detail}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// LLM (chat completions)
// ---------------------------------------------------------------------------

const chatCompletionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
  usage: z.object({ cost: z.number().optional() }).passthrough().optional(),
})

/** OpenRouter requires json_schema names to match ^[a-zA-Z0-9_-]+$. */
function schemaName(task: string) {
  return task.replace(/[^a-zA-Z0-9_-]/g, '_') || 'reply'
}

export function createOpenRouterLlmClient({
  apiKey,
  model = DEFAULT_LLM_MODEL,
  fetch: fetchImpl = globalThis.fetch,
}: OpenRouterOptions & { model?: string }): LlmClient {
  return createLlmClient(`openrouter:${model}`, async ({ task, prompt }) => {
    const body = {
      model,
      messages: [
        { role: 'system', content: task.system },
        { role: 'user', content: prompt },
      ],
      max_tokens: Math.min(task.maxTokens ?? DEFAULT_MAX_TOKENS, MAX_TOKENS_CAP),
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName(task.name), strict: true, schema: task.jsonSchema },
      },
      // Only route to providers that honour structured output.
      provider: { require_parameters: true },
      usage: { include: true },
    }

    const started = Date.now()
    const reply = chatCompletionSchema.parse(
      await postJson(fetchImpl, apiKey, '/chat/completions', body, LLM_TIMEOUT_MS),
    )
    console.log(`[llm] task=${task.name} model=${model} ms=${Date.now() - started} cost=${reply.usage?.cost ?? 'n/a'}`)
    const content = reply.choices[0].message.content
    if (content == null) throw new Error(`OpenRouter returned no content for task "${task.name}"`)
    return content
  })
}

// ---------------------------------------------------------------------------
// Transcription (Whisper)
// ---------------------------------------------------------------------------

/** Whisper `verbose_json` reply; times are in seconds. */
const whisperResponseSchema = z.object({
  usage: z.object({ cost: z.number().optional() }).passthrough().optional(),
  text: z.string().optional(),
  duration: z.number().optional(),
  segments: z.array(z.object({ start: z.number(), end: z.number(), text: z.string() })).optional(),
})

export type WhisperResponse = z.infer<typeof whisperResponseSchema>

const WHISPER_SPEAKER = 'Speaker'

/** Maps a Whisper `verbose_json` reply to transcript segments (seconds -> ms). */
export function mapWhisperSegments(response: WhisperResponse): TranscribedSegment[] {
  const segments = (response.segments ?? [])
    .map((s) => ({
      startMs: Math.round(s.start * 1000),
      endMs: Math.round(s.end * 1000),
      text: s.text.trim(),
      speaker: WHISPER_SPEAKER,
    }))
    .filter((s) => s.text.length > 0)

  if (segments.length === 0 && response.text?.trim()) {
    segments.push({
      startMs: 0,
      endMs: Math.round((response.duration ?? 0) * 1000),
      text: response.text.trim(),
      speaker: WHISPER_SPEAKER,
    })
  }
  return segments
}

/**
 * Upload file extension -> OpenRouter `input_audio.format`. Only the formats
 * Ed verified live (2026-10-26): browser captures (webm) and the demo lecture
 * (wav). Uploads also accept mp3/m4a/ogg, which work in mock mode only until
 * verified.
 */
const AUDIO_FORMATS: Record<string, string> = {
  webm: 'webm',
  wav: 'wav',
}

/** Whisper hosts commonly cap requests around 25 MB; fail before the upload. */
export const MAX_TRANSCRIBE_BYTES = 25 * 1024 * 1024

export function createOpenRouterWhisperTranscriber({
  apiKey,
  fetch: fetchImpl = globalThis.fetch,
}: OpenRouterOptions): Transcriber {
  return {
    name: 'openrouter-whisper',
    async transcribe(audioFilePath) {
      const extension = path.extname(audioFilePath).slice(1).toLowerCase()
      const format = AUDIO_FORMATS[extension]
      if (!format) {
        throw new Error(`Live transcription supports ${Object.keys(AUDIO_FORMATS).join(' and ')} audio, not "${extension}"`)
      }
      const { size } = await stat(audioFilePath)
      if (size > MAX_TRANSCRIBE_BYTES) {
        throw new Error(
          `Recording is ${(size / 1024 / 1024).toFixed(1)} MB; live transcription accepts up to ${MAX_TRANSCRIBE_BYTES / 1024 / 1024} MB`,
        )
      }

      const audio = await readFile(audioFilePath)
      const body = {
        model: WHISPER_MODEL,
        input_audio: { data: audio.toString('base64'), format },
        language: 'en',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
        // Groq is the fast Whisper host; fail rather than silently use a slower one.
        provider: { order: ['groq'], allow_fallbacks: false },
      }
      const started = Date.now()
      const response = whisperResponseSchema.parse(
        await postJson(fetchImpl, apiKey, '/audio/transcriptions', body, TRANSCRIBE_TIMEOUT_MS),
      )
      console.log(
        `[transcribe] model=${WHISPER_MODEL} bytes=${size} audio_s=${response.duration ?? 'n/a'} ` +
          `ms=${Date.now() - started} cost=${response.usage?.cost ?? 'n/a'}`,
      )
      return mapWhisperSegments(response)
    },
  }
}
