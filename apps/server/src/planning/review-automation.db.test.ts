// @vitest-environment node
/**
 * Integration tests for the lecture AI jobs (summary, confusion -> review)
 * and re-placing reviews when the automation is edited, against a real
 * Postgres with the fake LLM and transcriber.
 *
 * Opt-in like plan-items.db.test.ts: runs only when TEST_DATABASE_URL points
 * at a migrated database. Fresh random user ids; rows deleted afterwards.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t7 pnpm test review-automation.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { startOfLocalDay, wallClock, zonedTimeToUtc } from '@pls/scheduler'
import type { ExecutorRegistry, JobRun } from '@pls/workflows'
import { LECTURE_SUMMARY_ANCHOR, REVIEW_TASK_JOB } from '@pls/substrate'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const TZ = 'Europe/London'
const MIN = 60_000

/** `hour`:00 local time on the day starting at `dayStart`. */
function atLocal(dayStart: number, hour: number): number {
  const w = wallClock(dayStart, TZ)
  return zonedTimeToUtc(w.year, w.month, w.day, hour * 60, TZ)
}

describe.skipIf(!TEST_DATABASE_URL)('lecture AI jobs and the confusion automation (Postgres)', () => {
  let db: typeof import('@pls/db')
  let executors: ExecutorRegistry
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const rec = `rec-${randomUUID().slice(0, 8)}`
  const seg = (n: number) => `${rec}-seg-${n}`
  let workflowId: string
  let workflowJobId: string

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })

    await db.withUser(alice, async (tx) => {
      await tx`INSERT INTO recordings (id, user_id, title, status) VALUES (${rec}, ${alice}, 'Mitochondrial DNA', 'ready')`
      await tx`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${alice}, 'recording', ${rec}, 'biology')`
      const texts = [
        'Mitochondria have their own DNA, separate from the nuclear DNA.',
        'Here is the critical point: mitochondrial DNA is inherited exclusively from the maternal line.',
        'The sperm cell mitochondria are destroyed after fertilization. This is called maternal inheritance.',
        'Maternal inheritance means we can trace lineages through mitochondrial DNA.',
      ]
      for (const [i, text] of texts.entries()) {
        await tx`
          INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text, speaker)
          VALUES (${seg(i)}, ${alice}, ${rec}, ${i * 60000}, ${(i + 1) * 60000}, ${text}, 'Prof')
        `
      }
      const [wf] = await tx`
        INSERT INTO workflows (user_id, source_lens, trigger_event, condition_field, condition_value)
        VALUES (${alice}, 'transcript', 'tag:created', 'label', 'confused') RETURNING id
      `
      workflowId = wf.id
      const [job] = await tx`
        INSERT INTO workflow_jobs (user_id, workflow_id, job_type, params)
        VALUES (${alice}, ${workflowId}, ${REVIEW_TASK_JOB}, ${tx.json({ durationMin: 20, windowDays: 3, timeZone: TZ })})
        RETURNING id
      `
      workflowJobId = job.id
    })
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'workspaces', 'tags', 'annotations', 'plan_items', 'transcript_segments', 'recordings']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [alice])
    }
    await db.sql.end()
  })

  /** Runs the review job for a moment as the runner would, and records the run. */
  async function markConfused(segmentId: string) {
    const input = { target_type: 'transcript_segment', target_id: segmentId, label: 'confused', _userId: alice }
    const jobRun = { id: randomUUID(), workflow_id: workflowId, workflow_job_id: workflowJobId } as JobRun
    const result = await executors.execute(REVIEW_TASK_JOB, input, { scopeId: null, depth: 1, jobRun })
    await db.withUser(alice, (tx) => tx`
      INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, status, input, output)
      VALUES (${alice}, ${workflowId}, ${workflowJobId}, ${REVIEW_TASK_JOB}, 'completed', ${tx.json(input)}, ${tx.json(result.output as never)})
    `)
    return result
  }

  const ms = (iso: string | null) => Date.parse(iso!)

  it('turns a confused moment into a linked, course-filed review placed late in its window around a shift', async () => {
    const now = Date.now()
    // A shift filling the evening of the window's last day: the review must avoid it.
    const lastDay = startOfLocalDay(now, TZ, 3)
    const shiftStart = atLocal(lastDay, 17)
    const shiftEnd = atLocal(lastDay, 22)
    const api = caller(alice)
    const shift = await api.planItems.create({
      kind: 'commitment', title: 'Cafe shift', subtype: 'shift', course: null,
      starts_at: new Date(shiftStart).toISOString(), ends_at: new Date(shiftEnd).toISOString(),
    })

    const result = await markConfused(seg(1))
    const review = await api.planItems.byId(result.output.plan_item_id as string)
    expect(review).toMatchObject({
      kind: 'task',
      title: 'Review: maternal inheritance',
      duration_min: 20,
      subtype: 'review',
      source_type: 'recording',
      source_id: rec,
      source_offset_ms: 60000,
      created_by_workflow_id: workflowId,
      course: 'biology',
      status: 'open',
    })
    // The automation that made it, for "Made by ... Edit".
    expect(await api.workflows.byId(workflowId)).toMatchObject({
      id: workflowId, condition_value: 'confused', jobs: [expect.objectContaining({ job_type: REVIEW_TASK_JOB })],
    })
    expect(result.events).toEqual([expect.objectContaining({ type: 'plan-item:created', payload: expect.objectContaining({ id: review!.id }) })])

    const start = ms(review!.starts_at)
    const end = ms(review!.ends_at)
    expect(end - start).toBe(20 * MIN)
    expect(start).toBeGreaterThanOrEqual(now)
    expect(end).toBeLessThanOrEqual(startOfLocalDay(now, TZ, 4))
    // Latest fit that clears the shift and its 10-minute buffer: just before 16:50.
    expect(end).toBeLessThanOrEqual(shiftStart - 10 * MIN)
    expect(end).toBeGreaterThan(shiftStart - 60 * MIN)
    expect(ms(review!.due_at)).toBe(startOfLocalDay(now, TZ, 4) - MIN)

    // The shift is untouched.
    expect(await api.planItems.byId(shift.id)).toMatchObject({ starts_at: shift.starts_at, ends_at: shift.ends_at })
  })

  it('adds one review per moment, however often it is marked', async () => {
    const again = await markConfused(seg(1))
    expect(again.output.deduplicated).toBe(true)
    const reviews = await caller(alice).planItems.list({ sourceId: rec })
    expect(reviews.filter((r) => r.source_offset_ms === 60000)).toHaveLength(1)
  })

  it('re-places its own untouched reviews when the params change, and leaves hand-moved ones alone', async () => {
    const api = caller(alice)
    const handMoved = (await markConfused(seg(3))).output.plan_item_id as string
    const original = await api.planItems.byId(handMoved)
    const draggedTo = ms(original!.starts_at) - 60 * MIN
    await api.planItems.update({
      id: handMoved,
      patch: { starts_at: new Date(draggedTo).toISOString(), ends_at: new Date(draggedTo + 20 * MIN).toISOString() },
    })

    const [auto] = (await api.planItems.list({ sourceId: rec })).filter((r) => r.source_offset_ms === 60000)
    const { reviews } = await api.workflows.patch({
      workflowId,
      jobParams: [{ workflowJobId, params: { durationMin: 30, windowDays: 1, timeZone: TZ } }],
    })
    expect(reviews).toEqual({ moved: 1, unscheduled: 0 })

    const moved = await api.planItems.byId(auto.id)
    expect(moved!.duration_min).toBe(30)
    expect(ms(moved!.ends_at) - ms(moved!.starts_at)).toBe(30 * MIN)
    // "by tomorrow": ends by the end of tomorrow (local), late in the window.
    const byTomorrow = startOfLocalDay(ms(auto.created_at), TZ, 2)
    expect(ms(moved!.ends_at)).toBeLessThanOrEqual(byTomorrow)
    expect(ms(moved!.starts_at)).toBeGreaterThanOrEqual(startOfLocalDay(ms(auto.created_at), TZ, 1))
    expect(ms(moved!.starts_at)).not.toBe(ms(auto.starts_at))

    const untouched = await api.planItems.byId(handMoved)
    expect(ms(untouched!.starts_at)).toBe(draggedTo)
    expect(untouched!.duration_min).toBe(20)

    // Stored params are validated.
    await expect(api.workflows.patch({
      workflowId,
      jobParams: [{ workflowJobId, params: { durationMin: 0, windowDays: 1, timeZone: TZ } }],
    })).rejects.toThrow()
  })

  it('never moves a hand-moved review, even after the moment is marked again', async () => {
    const api = caller(alice)
    const id = (await markConfused(seg(2))).output.plan_item_id as string
    const placed = await api.planItems.byId(id)
    const draggedTo = ms(placed!.starts_at) - 90 * MIN
    await api.planItems.update({
      id,
      patch: { starts_at: new Date(draggedTo).toISOString(), ends_at: new Date(draggedTo + 30 * MIN).toISOString() },
    })
    // Marking it again adds nothing and records nothing about where it is now.
    const again = await markConfused(seg(2))
    expect(again.output).toEqual({ existing_plan_item_id: id, deduplicated: true, quiet: true })

    await api.workflows.patch({
      workflowId,
      jobParams: [{ workflowJobId, params: { durationMin: 45, windowDays: 2, timeZone: TZ } }],
    })
    const after = await api.planItems.byId(id)
    expect(ms(after!.starts_at)).toBe(draggedTo)
    expect(after!.duration_min).not.toBe(45)
  })

  it('keeps a gap between reviews it places', async () => {
    const { findReviewSlots } = await import('./review-automation')
    const now = Date.now()
    const latest = startOfLocalDay(now, TZ, 3)
    const slots = await db.withUser(alice, (tx) => findReviewSlots(tx, alice, [
      { id: 'gap-a', durationMin: 20, latest },
      { id: 'gap-b', durationMin: 20, latest },
    ], { now, timeZone: TZ }))
    const a = slots.get('gap-a') as { start: number; end: number }
    const b = slots.get('gap-b') as { start: number; end: number }
    expect(b.end).toBeLessThanOrEqual(a.start - 10 * MIN)
  })

  it('runs the board copy of the automation for marks made on that board', async () => {
    const api = caller(alice)
    const [boardA, boardB] = await db.withUser(alice, async (tx) => {
      const rows = await tx`
        INSERT INTO workspaces (user_id, name) VALUES (${alice}, 'Board A'), (${alice}, 'Board B') RETURNING id
      `
      return rows.map((r) => r.id as string)
    })
    // Switching it off on board A makes a disabled copy there.
    await api.workflows.createOverride({ sourceWorkflowId: workflowId, workspaceId: boardA, enabled: false })
    const cards = await api.workflows.forLens({ lensType: 'transcript', workspaceId: boardA })
    expect(cards.filter((w) => w.trigger_event === 'tag:created')).toEqual([
      expect.objectContaining({ workspace_id: boardA, enabled: false }),
    ])

    const runsFor = async () => {
      const [{ n }] = await db.withUser(alice, (tx) => tx`
        SELECT count(*)::int AS n FROM job_runs
        WHERE user_id = ${alice} AND job_type = ${REVIEW_TASK_JOB} AND status = 'pending' AND input->>'target_id' = ${seg(0)}
      `)
      return n as number
    }
    const mark = (workspaceId: string | null) =>
      api.tags.create({ target_type: 'transcript_segment', target_id: seg(0), label: 'confused', workspaceId })

    await mark(boardA)
    expect(await runsFor()).toBe(0)
    await mark(boardB)
    expect(await runsFor()).toBe(1)
    await mark(null)
    expect(await runsFor()).toBe(2)
  })

  it('cascades job-raised events on the board the job came from (summary off on one board)', async () => {
    const api = caller(alice)
    const { createJobRunner, createWorkflowEngine } = await import('@pls/workflows')
    const { createPgAdapter } = await import('../workflows/pg-adapter')
    const { jobBoard } = await import('../workflows/job-runner')

    const [boardA, boardB] = await db.withUser(alice, async (tx) => {
      const rows = await tx`INSERT INTO workspaces (user_id, name) VALUES (${alice}, 'Lecture A'), (${alice}, 'Lecture B') RETURNING id`
      return rows.map((r) => r.id as string)
    })
    const transcribeWf = await api.workflows.create({
      workspaceId: null, sourceLens: 'audio-capture', triggerEvent: 'recording:completed',
      jobs: [{ jobType: 'ai:transcribe', sortOrder: 0 }],
    })
    const summaryWf = await api.workflows.create({
      workspaceId: null, sourceLens: 'audio-capture', triggerEvent: 'recording:transcribed',
      jobs: [{ jobType: 'ai:summarize-lecture', sortOrder: 0 }],
    })
    // The summary automation is switched off on board A only.
    await api.workflows.createOverride({ sourceWorkflowId: summaryWf.id, workspaceId: boardA, enabled: false })

    const adapter = createPgAdapter({ sql: db.sql, userId: alice })
    const runner = createJobRunner({
      adapter, executors, engine: createWorkflowEngine({ adapter }), scopeId: null, scopeForJob: jobBoard,
    })
    const summaryRuns = async (recordingId: string) => db.withUser(alice, (tx) => tx`
      SELECT input FROM job_runs
      WHERE user_id = ${alice} AND job_type = 'ai:summarize-lecture' AND input->>'recording_id' = ${recordingId}
    `)

    for (const [board, expected] of [[boardA, 0], [boardB, 1]] as const) {
      // Filter by user explicitly: tests may connect as a role that bypasses RLS.
      await db.withUser(alice, (tx) => tx`DELETE FROM job_runs WHERE user_id = ${alice} AND status = 'pending'`)
      const recordingId = `rec-${randomUUID().slice(0, 8)}`
      await db.withUser(alice, (tx) => tx`
        INSERT INTO recordings (id, user_id, title, audio_url, status) VALUES (${recordingId}, ${alice}, 'Upload', '/uploads/x.wav', 'uploaded')
      `)
      // As /upload does from a board.
      await api.workflows.dispatch({ eventType: 'recording:completed', payload: { recording_id: recordingId }, workspaceId: board })
      const [transcribeRun] = await db.withUser(alice, (tx) => tx`
        SELECT input FROM job_runs WHERE workflow_id = ${transcribeWf.id} AND input->>'recording_id' = ${recordingId}
      `)
      expect(transcribeRun.input._workspaceId).toBe(board)

      await runner.processOnce() // runs the transcription, which raises recording:transcribed
      const runs = await summaryRuns(recordingId)
      expect(runs).toHaveLength(expected)
      if (expected) expect(runs[0].input._workspaceId).toBe(board)
    }
  })

  it('writes a 3-line summary from the transcript after transcription, replacing any earlier one', async () => {
    const jobRun = { id: randomUUID(), workflow_id: 'wf', workflow_job_id: 'wfj' } as JobRun
    const input = { recording_id: rec, _userId: alice }
    await executors.execute('ai:summarize-lecture', input, { scopeId: null, depth: 1, jobRun })
    await executors.execute('ai:summarize-lecture', input, { scopeId: null, depth: 1, jobRun })

    const annotations = await caller(alice).annotations.list({ recordingId: rec })
    const summaries = annotations.filter((a) => a.anchor_type === LECTURE_SUMMARY_ANCHOR)
    expect(summaries).toHaveLength(1)
    const lines = (summaries[0].body as string).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines.join(' ')).toMatch(/mitochondrial|maternal/i)
  })

  it('cascades from transcription to the summary via recording:transcribed', async () => {
    const other = `rec-${randomUUID().slice(0, 8)}`
    await db.withUser(alice, (tx) => tx`
      INSERT INTO recordings (id, user_id, title, audio_url, status) VALUES (${other}, ${alice}, 'Upload', '/uploads/x.wav', 'uploaded')
    `)
    const jobRun = { id: randomUUID(), workflow_id: 'wf', workflow_job_id: 'wfj' } as JobRun
    const result = await executors.execute('ai:transcribe', { recording_id: other, _userId: alice }, { scopeId: null, depth: 1, jobRun })
    expect(result.events).toEqual([{ type: 'recording:transcribed', payload: { recording_id: other } }])
  })

  it('forgets which automation made a review once that automation is deleted, and keeps the review', async () => {
    const api = caller(alice)
    const [wf] = await db.withUser(alice, (tx) => tx`
      INSERT INTO workflows (user_id, source_lens, trigger_event, condition_field, condition_value)
      VALUES (${alice}, 'transcript', 'tag:created', 'label', 'question') RETURNING id
    `)
    const [item] = await db.withUser(alice, (tx) => tx`
      INSERT INTO plan_items (user_id, kind, title, created_by_workflow_id)
      VALUES (${alice}, 'task', 'Review: a question', ${wf.id}) RETURNING id
    `)
    expect(await api.planItems.byId(item.id as string)).toMatchObject({ created_by_workflow_id: wf.id })
    await api.workflows.delete({ workflowId: wf.id as string })
    expect(await api.workflows.byId(wf.id as string)).toBeNull()
    expect(await api.planItems.byId(item.id as string)).toMatchObject({ title: 'Review: a question', created_by_workflow_id: null })
  })

  it('never takes the automation from a client, on create or update', async () => {
    const api = caller(alice)
    const created = await api.planItems.create({ kind: 'task', title: 'Review: by hand', created_by_workflow_id: workflowId } as never)
    expect(created.created_by_workflow_id).toBeNull()
    const updated = await api.planItems.update({ id: created.id, patch: { title: 'Review: still by hand', created_by_workflow_id: workflowId } as never })
    expect(updated).toMatchObject({ title: 'Review: still by hand', created_by_workflow_id: null })
  })
})
