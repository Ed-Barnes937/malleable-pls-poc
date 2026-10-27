// @vitest-environment node
/**
 * Integration tests for recordings.byId's `processing` against a real
 * Postgres (opt-in, see plan-items.db.test.ts):
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t15 pnpm test recordings.db
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { randomUUID } from 'node:crypto'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('recordings.byId processing (Postgres)', () => {
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
    await db.withUser(user, (tx) => tx`
      INSERT INTO recordings (id, user_id, title, status) VALUES (${rec}, ${user}, 'Genetics', 'uploaded')
    `)
  })

  beforeEach(async () => {
    await db.sql`DELETE FROM job_runs WHERE user_id = ${user}`
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'recordings']) {
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
})
