// @vitest-environment node
/**
 * Readers and writers keyed by the board's lecture (02 phase 2): the
 * `andInLecture` narrowing, `lectures.byId` processing, links of a lecture,
 * and /upload into a lecture. Opt-in like the other db tests: runs only when
 * TEST_DATABASE_URL points at a migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test lecture-scope.db
 *
 * Fresh random user ids; rows deleted afterwards. No DDL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { LECTURE_SUMMARY_ANCHOR } from '@pls/substrate'
import { insertRecording } from '../test-support/recordings'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/** A minimal WAV header: enough for /upload's magic-byte check. */
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(16)])

describe.skipIf(!TEST_DATABASE_URL)('lecture scope (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  let handleUpload: typeof import('../upload').handleUpload
  let uploadsDir: string
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`
  // One Biology lecture in two parts, and a Chemistry lecture.
  const partOne = `rec-p1-${alice}`
  const partTwo = `rec-p2-${alice}`
  const chemRec = `rec-chem-${alice}`
  const seg = (rec: string, n: number) => `${rec}-seg-${n}`
  let bio: string
  let chem: string
  let bobLecture: string
  const api = () => caller(alice)

  /** POST /upload as `userId` with these headers; the status and JSON body. */
  async function upload(userId: string, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
    const req = Object.assign(Readable.from([WAV]), {
      method: 'POST',
      headers: { 'content-type': 'audio/wav', 'x-user-id': userId, 'x-recording-title': 'Part', ...headers },
    }) as unknown as IncomingMessage
    let status = 0
    let raw = ''
    const res = {
      writeHead: (code: number) => { status = code },
      end: (chunk?: string) => { raw = chunk ?? '' },
    } as unknown as ServerResponse
    await handleUpload(req, res)
    return { status, body: raw ? JSON.parse(raw) : {} }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    uploadsDir = await mkdtemp(path.join(tmpdir(), 'pls-uploads-'))
    process.env.UPLOADS_DIR = uploadsDir
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    handleUpload = (await import('../upload')).handleUpload
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })

    await db.withUser(alice, async (tx) => {
      bio = (await insertRecording(tx, { id: partOne, userId: alice, title: 'Cells', course: 'biology', createdAt: new Date('2026-10-01T10:00:00Z') })).lectureId
      await tx`
        INSERT INTO recordings (id, user_id, lecture_id, title, status, created_at)
        VALUES (${partTwo}, ${alice}, ${bio}, 'Cells, part 2', 'uploaded', ${new Date('2026-10-01T11:00:00Z')})
      `
      chem = (await insertRecording(tx, { id: chemRec, userId: alice, title: 'Alkenes', course: 'chemistry' })).lectureId
      for (const rec of [partOne, partTwo, chemRec]) {
        await tx`
          INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text)
          VALUES (${seg(rec, 0)}, ${alice}, ${rec}, 0, 1000, 'text')
        `
        await tx`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${alice}, 'transcript_segment', ${seg(rec, 0)}, 'confused')`
        await tx`INSERT INTO annotations (user_id, anchor_type, anchor_id, body) VALUES (${alice}, 'transcript_segment', ${seg(rec, 0)}, 'note')`
        await tx`INSERT INTO annotations (user_id, anchor_type, anchor_id, body) VALUES (${alice}, ${LECTURE_SUMMARY_ANCHOR}, ${rec}, 'summary')`
        await tx`
          INSERT INTO confidence_signals (user_id, target_type, target_id, score)
          VALUES (${alice}, 'transcript_segment', ${seg(rec, 0)}, 0.5)
        `
      }
      // A link out of part two's moment to the Chemistry one.
      await tx`
        INSERT INTO links (user_id, source_type, source_id, target_type, target_id, relationship)
        VALUES (${alice}, 'transcript_segment', ${seg(partTwo, 0)}, 'transcript_segment', ${seg(chemRec, 0)}, 'related')
      `
      // Part two is being transcribed.
      await tx`
        INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, status, input)
        VALUES (${alice}, 'manual', 'manual', 'ai:transcribe', 'running', ${tx.json({ recording_id: partTwo })})
      `
    })
    await db.withUser(bob, async (tx) => {
      bobLecture = (await insertRecording(tx, { id: `rec-${bob}`, userId: bob, title: 'Bob', course: 'biology' })).lectureId
    })
  })

  afterAll(async () => {
    if (db) {
      for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'user_provisioning', 'links', 'confidence_signals', 'annotations', 'tags', 'workspaces', 'lectures']) {
        await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice, bob]])
      }
      await db.sql.end()
    }
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true })
  })

  describe('readers narrow to the lecture (andInLecture)', () => {
    it("tags, notes and confidence of every recording of the lecture, and only those", async () => {
      const scope = { lectureId: bio, courseTag: 'biology' }
      expect((await api().tags.list(scope)).map((t) => t.target_id).sort()).toEqual([seg(partOne, 0), seg(partTwo, 0)])
      expect((await api().confidence.list(scope)).map((c) => c.target_id).sort()).toEqual([seg(partOne, 0), seg(partTwo, 0)])
      const notes = await api().annotations.list(scope)
      expect(notes.map((a) => [a.anchor_type, a.anchor_id]).sort()).toEqual([
        [LECTURE_SUMMARY_ANCHOR, partOne], [LECTURE_SUMMARY_ANCHOR, partTwo],
        ['transcript_segment', seg(partOne, 0)], ['transcript_segment', seg(partTwo, 0)],
      ])
    })

    it('applies the course too: a lecture outside it gives nothing', async () => {
      expect(await api().tags.list({ lectureId: chem, courseTag: 'biology' })).toEqual([])
      expect(await api().annotations.list({ lectureId: chem, courseTag: 'biology' })).toEqual([])
      expect(await api().confidence.list({ lectureId: chem, courseTag: 'biology' })).toEqual([])
    })

    it('a recording narrows to that one part', async () => {
      expect((await api().tags.list({ recordingId: partTwo })).map((t) => t.target_id)).toEqual([seg(partTwo, 0)])
      expect((await api().annotations.list({ lectureId: bio, recordingId: partOne })).map((a) => a.anchor_id).sort())
        .toEqual([partOne, seg(partOne, 0)].sort())
    })

    it("another student's lecture gives nothing", async () => {
      expect(await caller(bob).tags.list({ lectureId: bio })).toEqual([])
      expect(await api().tags.list({ lectureId: bobLecture })).toEqual([])
    })

    it('links.byLecture lists links out of any of its recordings', async () => {
      const links = await api().links.byLecture({ lectureId: bio })
      expect(links).toEqual([expect.objectContaining({ sourceId: seg(partTwo, 0), relationship: 'related' })])
      expect(await api().links.byLecture({ lectureId: chem })).toEqual([])
      expect(await caller(bob).links.byLecture({ lectureId: bio })).toEqual([])
    })
  })

  it("lectures.byId and list say what each recording's AI jobs are doing", async () => {
    const lecture = await api().lectures.byId(bio)
    expect(lecture?.recordings).toEqual([
      expect.objectContaining({ id: partOne, processing: null }),
      expect.objectContaining({ id: partTwo, processing: 'transcribing' }),
    ])
    const listed = (await api().lectures.list({ courseTag: 'biology' })).find((l) => l.id === bio)
    expect(listed?.recordings.map((r) => r.processing)).toEqual([null, 'transcribing'])
    // The same answer as recordings.byId.
    expect(await api().recordings.byId(partTwo)).toMatchObject({ processing: 'transcribing' })
  })

  describe('/upload', () => {
    it('with x-lecture-id records into that lecture, filed under its course', async () => {
      const { status, body } = await upload(alice, { 'x-lecture-id': chem, 'x-recording-course': 'physics' })
      expect(status).toBe(200)
      expect(body.lectureId).toBe(chem)
      expect(await api().recordings.byId(body.id as string)).toMatchObject({ lecture_id: chem, course: 'chemistry' })
      expect((await api().lectures.byId(chem))!.recordings.map((r) => r.id)).toContain(body.id)
    })

    it('without one makes a new lecture under the course, and says which', async () => {
      const { status, body } = await upload(alice, { 'x-recording-course': 'physics' })
      expect(status).toBe(200)
      expect(body.lectureId).not.toBe(chem)
      expect(await api().lectures.byId(body.lectureId as string)).toMatchObject({
        course: 'physics', title: 'Part', recordings: [expect.objectContaining({ id: body.id })],
      })
    })

    it("another student's lecture, or one that is gone, is 404 and leaves nothing behind", async () => {
      const filesBefore = (await readdir(uploadsDir)).length
      const recordingsBefore = (await api().recordings.list()).length
      expect((await upload(alice, { 'x-lecture-id': bobLecture })).status).toBe(404)
      expect((await upload(alice, { 'x-lecture-id': 'lec-missing' })).status).toBe(404)
      expect((await upload(alice, { 'x-lecture-id': 'not a valid id!' })).status).toBe(400)
      expect((await readdir(uploadsDir)).length).toBe(filesBefore)
      expect((await api().recordings.list()).length).toBe(recordingsBefore)
      expect((await caller(bob).lectures.byId(bobLecture))!.recordings).toHaveLength(1)
    })
  })
})
