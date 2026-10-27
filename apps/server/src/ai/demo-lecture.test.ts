// @vitest-environment node
import { createHash } from 'crypto'
import { copyFile, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  demoLectureAudioPath,
  demoLectureFixturePath,
  loadDemoLecture,
  withDemoLectureCache,
  type DemoLecture,
} from './demo-lecture'
import type { TranscribedSegment, Transcriber } from './transcriber'

const SCRIPT_PATH = demoLectureFixturePath().replace(/\.segments\.json$/, '.md')

const FALLBACK_SEGMENTS: TranscribedSegment[] = [{ startMs: 0, endMs: 1000, text: 'Canned.', speaker: 'Lecturer' }]

function fallbackTranscriber(): Transcriber & { calls: string[] } {
  const calls: string[] = []
  return {
    name: 'mock',
    calls,
    async transcribe(audioFilePath) {
      calls.push(audioFilePath)
      return FALLBACK_SEGMENTS
    },
  }
}

/** The spoken paragraphs, parsed the way make-lecture.sh does. */
function spokenParagraphs(markdown: string): string[] {
  return markdown
    .split(/\n\s*\n/)
    .map((block) => block.split('\n').filter((line) => !/^[#>]/.test(line)).join(' ').trim())
    .filter(Boolean)
}

describe('demo lecture fixture', () => {
  let lecture: DemoLecture
  beforeAll(async () => {
    lecture = await loadDemoLecture()
  })

  it('describes the committed wav (regenerate both with scripts/demo/make-lecture.sh)', async () => {
    const wav = await readFile(demoLectureAudioPath())
    expect(wav.length).toBe(lecture.audioBytes)
    expect(createHash('sha256').update(wav).digest('hex')).toBe(lecture.audioSha256)
  })

  it('holds the script text, one segment per paragraph', async () => {
    const markdown = await readFile(SCRIPT_PATH, 'utf8')
    expect(lecture.segments.map((s) => s.text)).toEqual(spokenParagraphs(markdown))
  })

  it('has ordered, non-overlapping timings inside the audio', () => {
    let previousEnd = 0
    for (const segment of lecture.segments) {
      expect(segment.startMs).toBeGreaterThanOrEqual(previousEnd)
      expect(segment.endMs).toBeGreaterThan(segment.startMs)
      previousEnd = segment.endMs
    }
    expect(previousEnd).toBeLessThanOrEqual(lecture.durationMs)
    // A 3-5 minute lecture.
    expect(lecture.durationMs).toBeGreaterThan(3 * 60_000)
    expect(lecture.durationMs).toBeLessThan(5 * 60_000)
  })

  it('has exactly one maternal inheritance moment to mark as confusing', () => {
    const moments = lecture.segments.filter((s) => /let me try to explain maternal inheritance/i.test(s.text))
    expect(moments).toHaveLength(1)
  })
})

describe('withDemoLectureCache', () => {
  let dir: string
  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'demo-lecture-'))
  })
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns the real script with its timings for an upload of the demo wav', async () => {
    // Uploads are stored under a new name, so matching must be by content.
    const upload = path.join(dir, 'upload-123.wav')
    await copyFile(demoLectureAudioPath(), upload)
    const fallback = fallbackTranscriber()

    const segments = await withDemoLectureCache(fallback).transcribe(upload)

    const lecture = await loadDemoLecture()
    expect(segments).toEqual(lecture.segments.map((s) => ({ ...s, speaker: 'Lecturer' })))
    expect(fallback.calls).toEqual([])
  })

  it('falls back for a different file of the same size', async () => {
    const lecture = await loadDemoLecture()
    const upload = path.join(dir, 'same-size.wav')
    await writeFile(upload, Buffer.alloc(lecture.audioBytes))
    const fallback = fallbackTranscriber()

    expect(await withDemoLectureCache(fallback).transcribe(upload)).toEqual(FALLBACK_SEGMENTS)
    expect(fallback.calls).toEqual([upload])
  })

  it('falls back for any other upload, and for a missing file', async () => {
    const upload = path.join(dir, 'other.webm')
    await writeFile(upload, 'not the demo')
    const fallback = fallbackTranscriber()
    const transcriber = withDemoLectureCache(fallback)

    expect(await transcriber.transcribe(upload)).toEqual(FALLBACK_SEGMENTS)
    expect(await transcriber.transcribe(path.join(dir, 'missing.wav'))).toEqual(FALLBACK_SEGMENTS)
  })

  it('falls back when the fixture is unavailable', async () => {
    const upload = path.join(dir, 'demo-copy.wav')
    await copyFile(demoLectureAudioPath(), upload)
    const fallback = fallbackTranscriber()

    const transcriber = withDemoLectureCache(fallback, { fixturePath: path.join(dir, 'nope.json') })

    expect(await transcriber.transcribe(upload)).toEqual(FALLBACK_SEGMENTS)
  })

  it('keeps the fallback name, so mock mode still reports "mock"', () => {
    expect(withDemoLectureCache(fallbackTranscriber()).name).toBe('mock')
  })
})
