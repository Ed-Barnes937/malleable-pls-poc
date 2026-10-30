// @vitest-environment node
/**
 * Integration tests for recordings.byId's `processing` and the lecture's
 * `course` against a real Postgres (opt-in, see plan-items.db.test.ts):
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t15 pnpm test recordings.db
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'
import { insertRecording } from '../test-support/recordings'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('recordings (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: ReturnType<typeof import('../router').appRouter.createCaller>
  const user = `test-rec-${randomUUID().slice(0, 8)}`
  const rec = `rec-${user}`

  /** A job run for this lecture. Pending runs wait an hour, so no job runner picks them up. */
  const job = (jobType: string, status: string, recordingId = rec) => db.withUser(user, (tx) => tx`
    INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, status, input, run_after)
    VALUES (${user}, 'wf-test', 'wj-test', ${jobType}, ${status},
            ${tx.json({ recording_id: recordingId })}, now() + interval '1 hour')
  `)

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    caller = appRouter.createCaller({ userId: user, ai, executors: createServerExecutors(ai) })
    await db.withUser(user, (tx) => insertRecording(tx, { id: rec, userId: user, title: 'Genetics', status: 'uploaded' }))
  })

  beforeEach(async () => {
    await db.sql`DELETE FROM job_runs WHERE user_id = ${user}`
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'tags', 'transcript_segments', 'recordings', 'lectures']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [user])
    }
    await db.sql.end()
  })

  it('is null when no AI job is waiting on the lecture', async () => {
    await job('ai:transcribe', 'completed')
    await job('ai:summarize-lecture', 'failed')
    await job('ai:transcribe', 'running', 'rec-other')
    expect(await caller.recordings.byId(rec)).toMatchObject({ id: rec, processing: null })
  })

  it('says transcribing while the transcript job is queued or running', async () => {
    await job('ai:transcribe', 'pending')
    expect((await caller.recordings.byId(rec))?.processing).toBe('transcribing')
  })

  it('says summarising once only the summary job is left', async () => {
    await job('ai:transcribe', 'completed')
    await job('ai:summarize-lecture', 'running')
    expect((await caller.recordings.byId(rec))?.processing).toBe('summarising')
  })

  it('puts transcribing first when both are waiting', async () => {
    await job('ai:summarize-lecture', 'pending')
    await job('ai:transcribe', 'running')
    expect((await caller.recordings.byId(rec))?.processing).toBe('transcribing')
  })

  it('is null for a lecture that does not exist', async () => {
    expect(await caller.recordings.byId('rec-missing')).toBeNull()
  })

  it("carries the course from the recording's lecture, or null when it has none", async () => {
    const filed = `rec-filed-${user}`
    const unfiled = `rec-unfiled-${user}`
    const now = Date.now()
    await db.withUser(user, async (tx) => {
      await insertRecording(tx, { id: filed, userId: user, title: 'Cells', course: 'biology', createdAt: new Date(now + 86_400_000) })
      await insertRecording(tx, { id: unfiled, userId: user, title: 'Untitled', createdAt: new Date(now + 3_600_000) })
      // A course-named tag on a recording is just a tag: the lecture holds the course.
      await tx`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${user}, 'recording', ${unfiled}, 'chemistry')`
    })
    expect(await caller.recordings.byId(filed)).toMatchObject({ id: filed, course: 'biology' })
    expect(await caller.recordings.byId(unfiled)).toMatchObject({ id: unfiled, course: null })
    expect(await caller.recordings.byId(rec)).toMatchObject({ id: rec, course: null })
    expect((await caller.recordings.list()).map((r) => [r.id, r.course])).toEqual([[filed, 'biology'], [unfiled, null], [rec, null]])
    const unfiledLecture = (await caller.recordings.byId(unfiled))!.lecture_id as string
    expect(await caller.recordings.list({ lectureId: unfiledLecture })).toEqual([expect.objectContaining({ id: unfiled, course: null })])
    expect(await caller.recordings.list({ lectureId: unfiledLecture, courseTag: 'biology' })).toEqual([])
    expect(await caller.recordings.list({ courseTag: 'biology' })).toEqual([expect.objectContaining({ id: filed, course: 'biology' })])
  })

  describe('transcribe by hand', () => {
    const lecture = `rec-manual-${user}`
    const pendingRuns = () => db.withUser(user, (tx) => tx`
      SELECT id FROM job_runs WHERE job_type = 'ai:transcribe' AND status = 'pending' AND input->>'recording_id' = ${lecture}
    `)
    beforeEach(async () => {
      await db.withUser(user, async (tx) => {
        await tx`DELETE FROM transcript_segments WHERE recording_id = ${lecture}`
        // Its lecture too: recordings cascade with their lecture.
        await tx`DELETE FROM lectures WHERE id = ${`lec-${lecture}`}`
        await insertRecording(tx, { id: lecture, userId: user, title: 'Manual', status: 'uploaded' })
      })
    })

    it('queues the transcription for a lecture whose run failed, once', async () => {
      await job('ai:transcribe', 'failed', lecture)
      expect(await caller.recordings.transcribe({ recordingId: lecture })).toEqual({ queued: true })
      expect(await pendingRuns()).toHaveLength(1)
      expect(await caller.recordings.transcribe({ recordingId: lecture })).toEqual({ queued: false })
      expect(await pendingRuns()).toHaveLength(1)
    })

    it('does not bill again for a lecture that was transcribed but had nothing to say', async () => {
      await db.withUser(user, (tx) => tx`UPDATE recordings SET status = 'ready' WHERE id = ${lecture}`)
      expect(await caller.recordings.transcribe({ recordingId: lecture })).toEqual({ queued: false })
      expect(await pendingRuns()).toHaveLength(0)
    })

    it('does not transcribe a lecture twice: the job skips one that already has segments', async () => {
      await db.withUser(user, (tx) => tx`
        INSERT INTO transcript_segments (user_id, recording_id, start_ms, end_ms, text) VALUES (${user}, ${lecture}, 0, 1000, 'Hello.')
      `)
      const { createAiDeps } = await import('../ai/deps')
      const { createServerExecutors } = await import('../workflows/executors')
      const executors = createServerExecutors(createAiDeps())
      const jobRun = { id: randomUUID(), workflow_id: 'wf', workflow_job_id: 'wfj' } as never
      const result = await executors.execute('ai:transcribe', { recording_id: lecture, _userId: user }, { scopeId: null, depth: 0, jobRun })
      expect(result.output).toMatchObject({ skipped: 'already transcribed' })
      expect(result.events ?? []).toEqual([])
      const rows = await db.withUser(user, (tx) => tx`SELECT 1 FROM transcript_segments WHERE recording_id = ${lecture}`)
      expect(rows).toHaveLength(1)
    })

    it('the job also skips a lecture already transcribed with nothing said', async () => {
      await db.withUser(user, (tx) => tx`UPDATE recordings SET status = 'ready' WHERE id = ${lecture}`)
      const { createAiDeps } = await import('../ai/deps')
      const { createServerExecutors } = await import('../workflows/executors')
      const executors = createServerExecutors(createAiDeps())
      const jobRun = { id: randomUUID(), workflow_id: 'wf', workflow_job_id: 'wfj' } as never
      const result = await executors.execute('ai:transcribe', { recording_id: lecture, _userId: user }, { scopeId: null, depth: 0, jobRun })
      expect(result.output).toMatchObject({ skipped: 'already transcribed' })
      expect(result.events ?? []).toEqual([])
    })
  })
})
