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
import { LECTURE_SUMMARY_ANCHOR, REVIEW_TASK_JOB, WEEKDAYS, type StudyHours } from '@pls/substrate'
import { insertRecording } from '../test-support/recordings'

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
  let ai: ReturnType<typeof import('../ai/deps').createAiDeps>
  let makeExecutors: typeof import('../workflows/executors').createServerExecutors
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const dave = `test-dave-${randomUUID().slice(0, 8)}`
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
    const { mockTranscriptSegments } = await import('../ai/transcriber')
    // The same canned lecture as the mock transcriber, without its 1.5s demo
    // delay: three tests transcribe, and the delay alone made them time out
    // when the machine was loaded.
    const instantTranscriber = { name: 'mock', transcribe: async () => mockTranscriptSegments.map((s) => ({ ...s })) }
    ai = { ...createAiDeps(), transcriber: instantTranscriber }
    makeExecutors = createServerExecutors
    executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })

    await db.withUser(alice, async (tx) => {
      await insertRecording(tx, { id: rec, userId: alice, title: 'Mitochondrial DNA', course: 'biology' })
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
    for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'workspaces', 'tags', 'annotations', 'plan_items', 'transcript_segments', 'recordings', 'lectures']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = $1`, [alice])
    }
    await db.sql`DELETE FROM user_preferences WHERE user_id = ANY(${[alice, dave]})`
    await db.sql.end()
  })

  /** Marks the moment confusing (once) and runs the review job as the runner would, recording the run. */
  async function markConfused(segmentId: string, using: ExecutorRegistry = executors) {
    await db.withUser(alice, (tx) => tx`
      INSERT INTO tags (user_id, target_type, target_id, label)
      SELECT ${alice}, 'transcript_segment', ${segmentId}, 'confused'
      WHERE NOT EXISTS (SELECT 1 FROM tags WHERE user_id = ${alice} AND target_id = ${segmentId} AND label = 'confused')
    `)
    const input = { target_type: 'transcript_segment', target_id: segmentId, label: 'confused', _userId: alice }
    const jobRun = { id: randomUUID(), workflow_id: workflowId, workflow_job_id: workflowJobId } as JobRun
    const result = await using.execute(REVIEW_TASK_JOB, input, { scopeId: null, depth: 1, jobRun })
    await db.withUser(alice, (tx) => tx`
      INSERT INTO job_runs (user_id, workflow_id, workflow_job_id, job_type, status, input, output)
      VALUES (${alice}, ${workflowId}, ${workflowJobId}, ${REVIEW_TASK_JOB}, 'completed', ${tx.json(input)}, ${tx.json(result.output as never)})
    `)
    return result
  }

  const ms = (iso: string | null) => Date.parse(iso!)

  it('turns a confused moment into a linked, course-filed review in the earliest free time, around a shift', async () => {
    const now = Date.now()
    const today = startOfLocalDay(now, TZ)
    const tomorrow = startOfLocalDay(now, TZ, 1)
    const api = caller(alice)
    // Today is taken, and tomorrow's study day opens with a shift: the
    // earliest free time is after the shift and its 10-minute buffer.
    const busyToday = await api.planItems.create({
      kind: 'commitment', title: 'Away all day', subtype: null, course: null,
      starts_at: new Date(today).toISOString(), ends_at: new Date(tomorrow).toISOString(),
    })
    const shift = await api.planItems.create({
      kind: 'commitment', title: 'Cafe shift', subtype: 'shift', course: null,
      starts_at: new Date(atLocal(tomorrow, 9)).toISOString(), ends_at: new Date(atLocal(tomorrow, 11)).toISOString(),
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

    // 11:00 + 10-minute buffer, on the quarter hour.
    expect(ms(review!.starts_at)).toBe(atLocal(tomorrow, 11) + 15 * MIN)
    expect(ms(review!.ends_at)).toBe(atLocal(tomorrow, 11) + 35 * MIN)
    expect(ms(review!.due_at)).toBe(startOfLocalDay(now, TZ, 4) - MIN)

    // The shift is untouched.
    expect(await api.planItems.byId(shift.id)).toMatchObject({ starts_at: shift.starts_at, ends_at: shift.ends_at })
    await api.planItems.delete(busyToday.id)
    await api.planItems.delete(shift.id)
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
    // Earliest placement: it keeps its start if 30 minutes still fit there, else moves.
    expect(reviews.moved + reviews.resized).toBe(1)
    expect(reviews.unscheduled).toBe(0)

    const moved = await api.planItems.byId(auto.id)
    expect(moved!.duration_min).toBe(30)
    expect(ms(moved!.ends_at) - ms(moved!.starts_at)).toBe(30 * MIN)
    // "by tomorrow": ends by the end of tomorrow (local), never within the hour after the mark.
    const byTomorrow = startOfLocalDay(ms(auto.created_at), TZ, 2)
    expect(ms(moved!.ends_at)).toBeLessThanOrEqual(byTomorrow)
    expect(ms(moved!.starts_at)).toBeGreaterThanOrEqual(ms(auto.created_at) + 60 * MIN)

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

  it('keeps a gap between reviews it places, earliest first', async () => {
    const { findReviewSlots, reviewPlacement } = await import('./review-automation')
    const now = Date.now()
    const latest = startOfLocalDay(now, TZ, 3)
    const slots = await db.withUser(alice, async (tx) => findReviewSlots(tx, alice, [
      { id: 'gap-a', durationMin: 20, markedAt: now, latest },
      { id: 'gap-b', durationMin: 20, markedAt: now, latest },
    ], { now, placement: await reviewPlacement(tx, alice, TZ) }))
    const a = slots.get('gap-a') as { start: number; end: number }
    const b = slots.get('gap-b') as { start: number; end: number }
    expect(a.start).toBeGreaterThanOrEqual(now + 60 * MIN)
    expect(b.start).toBeGreaterThanOrEqual(a.end + 10 * MIN)
  })

  it("reads the due date and the slot in the student's own zone when it differs from the automation's", async () => {
    // The automation says London; the student's preference says Auckland (UTC+13 in November).
    const ZONE = 'Pacific/Auckland'
    const fresh = `${rec}-seg-zone`
    await db.withUser(alice, (tx) => tx`
      INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text, speaker)
      VALUES (${fresh}, ${alice}, ${rec}, 600000, 660000, 'Heteroplasmy: a cell can hold more than one kind of mitochondrial DNA.', 'Prof')
    `)
    await caller(alice).preferences.update({ time_zone: ZONE })
    try {
      const before = Date.now()
      const result = await markConfused(fresh)
      const after = Date.now()
      const review = await caller(alice).planItems.byId(result.output.plan_item_id as string)
      // Due 23:59 Auckland time on the last day of the window (as earlier tests left it), not London's.
      const [job] = await db.withUser(alice, (tx) => tx`SELECT params FROM workflow_jobs WHERE id = ${workflowJobId}`)
      const days = (job.params as { windowDays: number }).windowDays + 1
      const dueOptions = [before, after].map((t) => startOfLocalDay(t, ZONE, days) - MIN)
      expect(dueOptions).toContain(ms(review!.due_at))
      expect(dueOptions).not.toContain(startOfLocalDay(before, TZ, days) - MIN)
      // Placed inside 09:00-22:00 Auckland time, and before it is due.
      const start = wallClock(ms(review!.starts_at), ZONE)
      const startMin = start.hour * 60 + start.minute
      expect(startMin).toBeGreaterThanOrEqual(9 * 60)
      expect(startMin + 20).toBeLessThanOrEqual(22 * 60)
      expect(ms(review!.ends_at)).toBeLessThanOrEqual(ms(review!.due_at) + MIN)
    } finally {
      await caller(alice).preferences.update({ time_zone: null })
    }
  })

  it("places reviews only inside the student's study hours, never on a no-study day", async () => {
    const { findReviewSlots, reviewPlacement } = await import('./review-automation')
    const now = Date.now()
    // Only the day after tomorrow has study hours, 13:00-14:00; every other day is "no study".
    const open = startOfLocalDay(now, TZ, 2)
    const w = wallClock(open, TZ)
    const weekday = WEEKDAYS[(new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7]
    const hours = Object.fromEntries(WEEKDAYS.map((d) => [d, d === weekday ? { start: '13:00', end: '14:00' } : null])) as StudyHours
    await caller(dave).preferences.update({ study_hours: hours })

    const latest = startOfLocalDay(now, TZ, 4)
    const slots = await db.withUser(dave, async (tx) => findReviewSlots(tx, dave, [
      { id: 'hours-a', durationMin: 20, markedAt: now, latest },
      { id: 'hours-b', durationMin: 20, markedAt: now, latest },
      { id: 'hours-c', durationMin: 20, markedAt: now, latest },
    ], { now, placement: await reviewPlacement(tx, dave, TZ) }))
    expect(slots.get('hours-a')).toEqual({ start: atLocal(open, 13), end: atLocal(open, 13) + 20 * MIN })
    expect(slots.get('hours-b')).toEqual({ start: atLocal(open, 13) + 30 * MIN, end: atLocal(open, 13) + 50 * MIN })
    // No room left inside study hours: unscheduled rather than outside them.
    expect(slots.get('hours-c')).toEqual({ reason: 'no-free-slot' })
  })

  it("spends the student's own daily budget, going over it only when no day has room", async () => {
    const { findReviewSlots, reviewPlacement } = await import('./review-automation')
    const now = Date.now()
    // Two open days, 13:00-17:00, and 30 minutes of study a day.
    const first = startOfLocalDay(now, TZ, 2)
    const second = startOfLocalDay(now, TZ, 3)
    const key = (t: number) => {
      const w = wallClock(t, TZ)
      return WEEKDAYS[(new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7]
    }
    const hours = Object.fromEntries(WEEKDAYS.map((d) => [d, d === key(first) || d === key(second) ? { start: '13:00', end: '17:00' } : null])) as StudyHours
    await caller(dave).preferences.update({ study_hours: hours, study_min_per_day: 30 })

    const latest = startOfLocalDay(now, TZ, 4)
    const slots = await db.withUser(dave, async (tx) => findReviewSlots(tx, dave, [
      { id: 'budget-a', durationMin: 20, markedAt: now, latest },
      { id: 'budget-b', durationMin: 20, markedAt: now, latest },
      { id: 'budget-c', durationMin: 20, markedAt: now, latest },
    ], { now, placement: await reviewPlacement(tx, dave, TZ) }))
    expect((slots.get('budget-a') as { start: number }).start).toBe(atLocal(first, 13))
    // The first day has 10 minutes left: the next goes to the second day.
    expect((slots.get('budget-b') as { start: number }).start).toBe(atLocal(second, 13))
    // No day has 20 minutes left: over budget, in the earliest free slot (decision 11).
    expect((slots.get('budget-c') as { start: number }).start).toBe(atLocal(first, 13) + 30 * MIN)
    await caller(dave).preferences.update({ study_hours: null, study_min_per_day: null })
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
    // Marked, then unmarked (a tag is added once, so each mark is a fresh one).
    const mark = async (workspaceId: string | null) => {
      const tag = await api.tags.create({ target_type: 'transcript_segment', target_id: seg(0), label: 'confused', workspaceId })
      await api.tags.delete(tag.id)
    }

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
      await db.withUser(alice, (tx) =>
        insertRecording(tx, { id: recordingId, userId: alice, title: 'Upload', audioUrl: '/uploads/x.wav', status: 'uploaded' }))
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
    await db.withUser(alice, (tx) =>
      insertRecording(tx, { id: other, userId: alice, title: 'Upload', audioUrl: '/uploads/x.wav', status: 'uploaded' }))
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

  describe('a moment marked sorted', () => {
    const sortedSeg = seg(9)
    beforeAll(async () => {
      await db.withUser(alice, async (tx) => {
        for (const [id, at] of [[sortedSeg, 540000], [seg(10), 3000000], [seg(11), 3060000]] as const) {
          await tx`
            INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text, speaker)
            VALUES (${id}, ${alice}, ${rec}, ${at}, ${at + 60000}, 'Mitochondrial DNA mutates faster than nuclear DNA.', 'Prof')
          `
        }
      })
    })
    const tagsOn = async () => (await caller(alice).tags.forTarget({ targetType: 'transcript_segment', targetId: sortedSeg })).map((t) => t.label).sort()
    const reviewsOf = async () => (await caller(alice).planItems.list({ sourceId: rec, statuses: ['open', 'done', 'dismissed'] }))
      .filter((r) => r.source_offset_ms === 540000)

    it('a tag is added once however often it is created', async () => {
      const api = caller(alice)
      const first = await api.tags.create({ target_type: 'transcript_segment', target_id: sortedSeg, label: 'confused' })
      const again = await api.tags.create({ target_type: 'transcript_segment', target_id: sortedSeg, label: 'confused' })
      expect(again.id).toBe(first.id)
      expect(await tagsOn()).toEqual(['confused'])
      // Two racing clicks too.
      const [a, b] = await Promise.all([1, 2].map(() => api.tags.create({ target_type: 'transcript_segment', target_id: sortedSeg, label: 'question' })))
      expect(a.id).toBe(b.id)
      await api.tags.delete(a.id)
      expect(await tagsOn()).toEqual(['confused'])
    })

    it('dismisses its open review, keeps confused as history, and Undo brings the review back', async () => {
      const api = caller(alice)
      const reviewId = (await markConfused(sortedSeg)).output.plan_item_id as string
      expect(await api.planItems.byId(reviewId)).toMatchObject({ status: 'open' })

      const sorted = await api.tags.sort({ segmentId: sortedSeg })
      expect(sorted.dismissed).toEqual([reviewId])
      expect(await api.planItems.byId(reviewId)).toMatchObject({ status: 'dismissed' })
      expect(await tagsOn()).toEqual(['confused', 'sorted'])
      // Sorting twice adds nothing.
      expect((await api.tags.sort({ segmentId: sortedSeg })).dismissed).toEqual([])
      expect(await tagsOn()).toEqual(['confused', 'sorted'])

      const undone = await api.tags.unsort({ segmentId: sortedSeg, restore: sorted.dismissed })
      expect(undone.restored).toEqual([reviewId])
      expect(await api.planItems.byId(reviewId)).toMatchObject({ status: 'open' })
      expect(await tagsOn()).toEqual(['confused'])
    })

    it('gets no more reviews from the automation, and a plain un-sort leaves its dismissed review alone', async () => {
      const api = caller(alice)
      await api.tags.sort({ segmentId: sortedSeg })
      const again = await markConfused(sortedSeg)
      expect(again.output).toMatchObject({ skipped: 'moment sorted', quiet: true })
      expect((await reviewsOf()).map((r) => r.status)).toEqual(['dismissed'])

      await api.tags.unsort({ segmentId: sortedSeg })
      expect(await tagsOn()).toEqual(['confused'])
      expect((await reviewsOf()).map((r) => r.status)).toEqual(['dismissed'])
    })

    it('restores only its own dismissed reviews', async () => {
      const api = caller(alice)
      const other = await api.planItems.create({ kind: 'task', title: 'Something else', subtype: null, course: null })
      await api.planItems.dismiss(other.id)
      await api.tags.sort({ segmentId: sortedSeg })
      await api.tags.unsort({ segmentId: sortedSeg, restore: [other.id] })
      expect(await api.planItems.byId(other.id)).toMatchObject({ status: 'dismissed' })
      await api.planItems.delete(other.id)
    })

    it('is sorted only by tags.sort, never by creating the tag', async () => {
      await expect(caller(alice).tags.create({ target_type: 'transcript_segment', target_id: sortedSeg, label: 'sorted' }))
        .rejects.toMatchObject({ code: 'BAD_REQUEST' })
    })

    it("can't be sorted or un-sorted by another user, and restore ignores their reviews", async () => {
      await expect(caller(dave).tags.sort({ segmentId: sortedSeg })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      await expect(caller(dave).tags.unsort({ segmentId: sortedSeg })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      const api = caller(alice)
      await api.tags.create({ target_type: 'transcript_segment', target_id: seg(11), label: 'confused' })
      const reviewId = (await markConfused(seg(11))).output.plan_item_id as string
      const { dismissed } = await api.tags.sort({ segmentId: seg(11) })
      expect(dismissed).toEqual([reviewId])
      // Dave asking to restore Alice's review on his own moment changes nothing.
      await expect(caller(dave).tags.unsort({ segmentId: seg(11), restore: [reviewId] })).rejects.toMatchObject({ code: 'NOT_FOUND' })
      expect(await api.planItems.byId(reviewId)).toMatchObject({ status: 'dismissed' })
      await api.tags.unsort({ segmentId: seg(11), restore: dismissed })
    })

    it('a sort landing while its review is being made: no review is made', async () => {
      const api = caller(alice)
      await api.tags.create({ target_type: 'transcript_segment', target_id: seg(10), label: 'confused' })
      // The student sorts it while the model is still naming the review.
      const slowLlm = {
        name: 'sorts-mid-run',
        run: async <I, O>(task: Parameters<typeof ai.llm.run<I, O>>[0], input: I): Promise<O> => {
          await api.tags.sort({ segmentId: seg(10) })
          return ai.llm.run(task, input)
        },
      }
      const result = await markConfused(seg(10), makeExecutors({ ...ai, llm: slowLlm }))
      expect(result.output, JSON.stringify(result.output)).toMatchObject({ skipped: 'moment sorted', quiet: true })
      const reviews = (await api.planItems.list({ sourceId: rec, statuses: ['open', 'done', 'dismissed'] })).filter((r) => r.source_offset_ms === 3000000)
      expect(reviews).toEqual([])
    })

    it('turning confused off dismisses its open review, and Undo brings back the mark as it was and the review', async () => {
      const api = caller(alice)
      const segId = seg(11)
      const tagsOf = async () => await api.tags.forTarget({ targetType: 'transcript_segment', targetId: segId })
      expect((await tagsOf()).map((t) => t.label)).toEqual(['confused'])
      const markedAt = new Date((await tagsOf())[0].created_at as string).toISOString()
      const reviewId = (await api.planItems.list({ sourceId: rec, statuses: ['open'] })).find((r) => r.source_offset_ms === 3060000)!.id

      const off = await api.tags.unmarkConfused({ segmentId: segId })
      expect(off).toEqual({ confusedAt: markedAt, dismissed: [reviewId] })
      expect(await tagsOf()).toEqual([])
      expect(await api.planItems.byId(reviewId)).toMatchObject({ status: 'dismissed' })

      const runsBefore = await db.withUser(alice, (tx) => tx`SELECT count(*)::int AS n FROM job_runs WHERE user_id = ${alice}`)
      expect(await api.tags.remarkConfused({ segmentId: segId, confusedAt: off.confusedAt!, restore: off.dismissed })).toEqual({ restored: [reviewId] })
      const back = await tagsOf()
      expect(back.map((t) => [t.label, new Date(t.created_at as string).toISOString()])).toEqual([['confused', markedAt]])
      expect(await api.planItems.byId(reviewId)).toMatchObject({ status: 'open' })
      // The mark comes back without running the automation again.
      expect(await db.withUser(alice, (tx) => tx`SELECT count(*)::int AS n FROM job_runs WHERE user_id = ${alice}`)).toEqual(runsBefore)

      // A sorted moment keeps its confusing mark.
      await api.tags.sort({ segmentId: segId })
      await expect(api.tags.unmarkConfused({ segmentId: segId })).rejects.toMatchObject({ code: 'CONFLICT' })
    })

    it('a confusing mark turned off while its review is being made: no review is made', async () => {
      const api = caller(alice)
      const segId = seg(12)
      await db.withUser(alice, (tx) => tx`
        INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text, speaker)
        VALUES (${segId}, ${alice}, ${rec}, 3120000, 3180000, 'Heteroplasmy again.', 'Prof')
      `)
      const unmarkingLlm = {
        name: 'unmarks-mid-run',
        run: async <I, O>(task: Parameters<typeof ai.llm.run<I, O>>[0], input: I): Promise<O> => {
          // Nothing to dismiss yet: the review isn't made.
          expect(await api.tags.unmarkConfused({ segmentId: segId })).toMatchObject({ dismissed: [] })
          return ai.llm.run(task, input)
        },
      }
      const result = await markConfused(segId, makeExecutors({ ...ai, llm: unmarkingLlm }))
      expect(result.output).toMatchObject({ skipped: 'mark removed', quiet: true })
      const reviews = (await api.planItems.list({ sourceId: rec, statuses: ['open', 'done', 'dismissed'] })).filter((r) => r.source_offset_ms === 3120000)
      expect(reviews).toEqual([])
    })

    it('an old Undo of turning confused off does nothing once the moment is marked again', async () => {
      const api = caller(alice)
      const segId = seg(13)
      await db.withUser(alice, (tx) => tx`
        INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text, speaker)
        VALUES (${segId}, ${alice}, ${rec}, 3180000, 3240000, 'Heteroplasmy once more.', 'Prof')
      `)
      const first = (await markConfused(segId)).output.plan_item_id as string
      const off = await api.tags.unmarkConfused({ segmentId: segId })
      expect(off.dismissed).toEqual([first])
      // Marked again: a new review.
      const second = (await markConfused(segId)).output.plan_item_id as string
      expect(second).not.toBe(first)
      // The first toast's Undo, late: nothing doubles.
      expect(await api.tags.remarkConfused({ segmentId: segId, confusedAt: off.confusedAt!, restore: off.dismissed })).toEqual({ restored: [] })
      const open = (await api.planItems.list({ sourceId: rec, statuses: ['open'] })).filter((r) => r.source_offset_ms === 3180000)
      expect(open.map((r) => r.id)).toEqual([second])
      expect((await api.tags.forTarget({ targetType: 'transcript_segment', targetId: segId })).map((t) => t.label)).toEqual(['confused'])

      // Off again with nothing marked since, but its review still open (e.g. reopened by hand): no Undo either.
      const off2 = await api.tags.unmarkConfused({ segmentId: segId })
      await api.planItems.update({ id: second, patch: { status: 'open' } })
      expect(await api.tags.remarkConfused({ segmentId: segId, confusedAt: off2.confusedAt!, restore: off2.dismissed })).toEqual({ restored: [] })
      expect(await api.tags.forTarget({ targetType: 'transcript_segment', targetId: segId })).toEqual([])
    })

    it('turning confused off returns the latest mark, the one the moment status reads', async () => {
      const api = caller(alice)
      const segId = seg(13)
      await db.withUser(alice, (tx) => tx`
        INSERT INTO tags (user_id, target_type, target_id, label, created_at) VALUES
          (${alice}, 'transcript_segment', ${segId}, 'confused', '2026-10-01T10:00:00Z'),
          (${alice}, 'transcript_segment', ${segId}, 'confused', '2026-10-02T10:00:00Z')
      `)
      expect((await api.tags.unmarkConfused({ segmentId: segId })).confusedAt).toBe('2026-10-02T10:00:00.000Z')
    })
  })
})
