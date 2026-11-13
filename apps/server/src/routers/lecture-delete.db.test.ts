// @vitest-environment node
/**
 * Deleting a lecture (`lectures.deletePreview`, `lectures.delete`) against a
 * real Postgres, opt-in like lectures.db.test.ts: runs only when
 * TEST_DATABASE_URL points at a migrated database.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { JobRun } from '@pls/workflows'
import { LECTURE_SUMMARY_ANCHOR, REVIEW_TASK_JOB } from '@pls/substrate'
import type { TxSql } from '@pls/db'
import { insertRecording } from '../test-support/recordings'
import type { AiDeps } from '../ai/deps'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('deleting a lecture (Postgres)', () => {
  let db: typeof import('@pls/db')
  let ai: AiDeps
  let makeExecutors: typeof import('../workflows/executors').createServerExecutors
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`
  const users = [alice, bob]
  const api = () => caller(alice)
  const notFound = expect.objectContaining({ code: 'NOT_FOUND' })
  const conflict = expect.objectContaining({ code: 'CONFLICT' })
  let uploads: string

  /** A unique id with a readable prefix. */
  const uid = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`
  const sqlAs = <T>(userId: string, fn: (tx: TxSql) => Promise<T>) => db.withUser(userId, fn)
  /**
   * How many sessions are waiting for a lock the session `holder` (a
   * `pg_backend_pid()`) holds. By pid: `pg_stat_activity` lists every
   * database on the server, so matching on query text also counts the same
   * test running against another database (a parallel run or checkout).
   */
  const waitingOn = async (holder: number) => (await db.sql`
    SELECT count(*)::int AS n FROM pg_stat_activity WHERE ${holder}::int = ANY(pg_blocking_pids(pid))
  `)[0].n as number

  /** An audio file under the uploads dir, and its `audio_url`. */
  function audioFile(): { url: string; file: string } {
    const name = `${randomUUID()}.webm`
    const file = path.join(uploads, name)
    writeFileSync(file, 'audio')
    return { url: `/uploads/${name}`, file }
  }

  async function addSegment(tx: TxSql, userId: string, recordingId: string, startMs: number): Promise<string> {
    const id = uid('seg')
    await tx`
      INSERT INTO transcript_segments (id, user_id, recording_id, start_ms, end_ms, text)
      VALUES (${id}, ${userId}, ${recordingId}, ${startMs}, ${startMs + 1000}, 'Mitochondria have their own DNA')
    `
    return id
  }

  async function addPlanItem(tx: TxSql, userId: string, item: {
    title: string; status?: string; sourceId?: string; course?: string; startsAt?: Date
  }): Promise<string> {
    const [row] = await tx`
      INSERT INTO plan_items (user_id, kind, title, status, starts_at, ends_at, subtype, source_type, source_id, source_offset_ms, course)
      VALUES (
        ${userId}, 'task', ${item.title}, ${item.status ?? 'open'},
        ${item.startsAt ?? null}, ${item.startsAt ? new Date(item.startsAt.getTime() + 30 * 60000) : null},
        'review', ${item.sourceId ? 'recording' : null}, ${item.sourceId ?? null}, ${item.sourceId ? 0 : null}, ${item.course ?? null}
      )
      RETURNING id
    `
    return row.id as string
  }

  /** Rows of `table` (past row-level security) whose `column` is one of `ids`. */
  async function rowsWhere(table: string, column: string, ids: string[]): Promise<number> {
    const [{ n }] = await db.sql.unsafe(`SELECT count(*)::int AS n FROM ${table} WHERE ${column} = ANY($1::text[])`, [ids])
    return n as number
  }

  /**
   * A lecture with everything that can hang off it: two recordings (one
   * whose file is already gone), segments, every kind of mark (tags on a
   * segment and the recording, a note and the AI summary, confidence,
   * links both ways), study blocks made from a moment (open with a course
   * tag, dismissed, done), a resource, a class it was made for, and two
   * boards showing it. Plus things that must survive: another lecture of
   * Alice's with its own marks, a plan item of her own.
   */
  async function seedLecture() {
    const recA = uid('rec')
    const recB = uid('rec')
    const audio = audioFile()
    const otherRec = uid('rec')
    const s = await sqlAs(alice, async (tx) => {
      const { lectureId } = await insertRecording(tx, { id: recA, userId: alice, title: 'Cells', course: 'biology', audioUrl: audio.url })
      await tx`UPDATE recordings SET duration = 600000 WHERE id = ${recA}`
      await tx`
        INSERT INTO recordings (id, user_id, lecture_id, title, duration, audio_url)
        VALUES (${recB}, ${alice}, ${lectureId}, 'Cells part 2', 300000, '/uploads/already-gone.webm')
      `
      const segA = await addSegment(tx, alice, recA, 0)
      const segB = await addSegment(tx, alice, recB, 0)
      const { lectureId: otherLecture } = await insertRecording(tx, { id: otherRec, userId: alice, title: 'Genes', course: 'biology' })
      const otherSeg = await addSegment(tx, alice, otherRec, 0)

      await tx`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${alice}, 'transcript_segment', ${segA}, 'confused')`
      await tx`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${alice}, 'recording', ${recB}, 'important')`
      await tx`INSERT INTO annotations (user_id, anchor_type, anchor_id, body) VALUES (${alice}, 'transcript_segment', ${segB}, 'Ask about this')`
      await tx`INSERT INTO annotations (user_id, anchor_type, anchor_id, body) VALUES (${alice}, ${LECTURE_SUMMARY_ANCHOR}, ${recA}, 'Summary')`
      await tx`
        INSERT INTO confidence_signals (user_id, target_type, target_id, score, source_lens_id)
        VALUES (${alice}, 'transcript_segment', ${segA}, 0.2, 'test-me')
      `
      await tx`
        INSERT INTO links (user_id, source_type, source_id, target_type, target_id, relationship)
        VALUES (${alice}, 'transcript_segment', ${segA}, 'transcript_segment', ${otherSeg}, 'related'),
               (${alice}, 'transcript_segment', ${otherSeg}, 'transcript_segment', ${segB}, 'related')
      `
      // The other lecture's own marks stay.
      await tx`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${alice}, 'transcript_segment', ${otherSeg}, 'confused')`

      const review = await addPlanItem(tx, alice, { title: 'Review: cells', sourceId: recA, course: 'biology', startsAt: new Date('2026-11-12T14:00:00Z') })
      const dismissed = await addPlanItem(tx, alice, { title: 'Review: membranes', status: 'dismissed', sourceId: recB })
      const done = await addPlanItem(tx, alice, { title: 'Review: nucleus', status: 'done', sourceId: recA, course: 'biology' })
      const unrelated = await addPlanItem(tx, alice, { title: 'Essay', course: 'biology' })
      const otherReview = await addPlanItem(tx, alice, { title: 'Review: genes', sourceId: otherRec })
      const classItem = await addPlanItem(tx, alice, { title: 'Biology class' })
      await tx`UPDATE lectures SET class_item_id = ${classItem}, class_date = '2026-11-10' WHERE id = ${lectureId}`

      await tx`
        INSERT INTO resources (user_id, kind, title, url, provider, lecture_id)
        VALUES (${alice}, 'link', 'Slides', 'https://example.com/slides', 'web', ${lectureId})
      `
      return { lectureId, segA, segB, otherLecture, otherSeg, review, dismissed, done, unrelated, otherReview, classItem }
    })
    const boardA = (await api().workspaces.create({ name: uid('Board'), courseTag: 'biology' })).id as string
    const boardB = (await api().workspaces.create({ name: uid('Board'), courseTag: 'biology' })).id as string
    for (const workspaceId of [boardA, boardB]) await api().workspaces.setBoardScope({ workspaceId, lectureId: s.lectureId })
    return { ...s, recA, recB, otherRec, audio, boardA, boardB }
  }

  beforeAll(async () => {
    uploads = mkdtempSync(path.join(tmpdir(), 'lecture-delete-'))
    process.env.UPLOADS_DIR = uploads
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    ;({ createServerExecutors: makeExecutors } = await import('../workflows/executors'))
    ai = createAiDeps()
    const executors = makeExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
  })

  afterAll(async () => {
    if (db) {
      await db.sql`DELETE FROM workspaces WHERE user_id = ANY(${users})`
      await db.sql`DELETE FROM lectures WHERE user_id = ANY(${users})`
      for (const table of ['tags', 'annotations', 'links', 'confidence_signals', 'plan_items', 'plan_item_trash', 'job_runs']) {
        await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1::text[])`, [users])
      }
      await db.sql.end()
    }
    rmSync(uploads, { recursive: true, force: true })
  })

  it('previews what would go, and deletes exactly that', async () => {
    const s = await seedLecture()

    const preview = await api().lectures.deletePreview(s.lectureId)
    expect(preview).toMatchObject({
      lecture: { id: s.lectureId, title: 'Cells' },
      recordings: { count: 2, durationMs: 900000 },
      // 2 tags, 2 notes (one the summary), 1 confidence rating, 2 links.
      marks: 7,
      // Soonest first; the finished one stays.
      planItems: [
        { id: s.review, title: 'Review: cells', starts_at: '2026-11-12T14:00:00.000Z', due_at: null },
        { id: s.dismissed, title: 'Review: membranes', starts_at: null, due_at: null },
      ],
      keptPlanItems: 1,
      resources: { count: 1, files: 0 },
    })
    expect(existsSync(s.audio.file)).toBe(true)

    expect(await api().lectures.delete({ id: s.lectureId, fingerprint: preview.fingerprint })).toEqual({ id: s.lectureId, title: 'Cells' })

    // Gone: the lecture, its recordings and segments, every mark on them,
    // the unfinished study blocks, the resource.
    expect(await rowsWhere('lectures', 'id', [s.lectureId])).toBe(0)
    expect(await rowsWhere('recordings', 'id', [s.recA, s.recB])).toBe(0)
    expect(await rowsWhere('transcript_segments', 'id', [s.segA, s.segB])).toBe(0)
    expect(await rowsWhere('tags', 'target_id', [s.segA, s.recB, s.review])).toBe(0)
    expect(await rowsWhere('annotations', 'anchor_id', [s.segB, s.recA])).toBe(0)
    expect(await rowsWhere('confidence_signals', 'target_id', [s.segA])).toBe(0)
    expect(await rowsWhere('links', 'source_id', [s.segA, s.otherSeg])).toBe(0)
    expect(await rowsWhere('plan_items', 'id', [s.review, s.dismissed])).toBe(0)
    expect(await rowsWhere('resources', 'lecture_id', [s.lectureId])).toBe(0)
    expect(existsSync(s.audio.file)).toBe(false)

    // Kept: the finished study block (no longer linked to a moment, still
    // in its course), the class, an unrelated item, the other lecture and
    // everything on it.
    const [done] = await db.sql`SELECT status, source_type, source_id, source_offset_ms, course FROM plan_items WHERE id = ${s.done}`
    expect(done).toEqual({ status: 'done', source_type: null, source_id: null, source_offset_ms: null, course: 'biology' })
    expect(await rowsWhere('plan_items', 'id', [s.classItem, s.unrelated, s.otherReview])).toBe(3)
    expect(await rowsWhere('lectures', 'id', [s.otherLecture])).toBe(1)
    expect(await rowsWhere('transcript_segments', 'id', [s.otherSeg])).toBe(1)
    expect(await rowsWhere('tags', 'target_id', [s.otherSeg])).toBe(1)

    // Both boards show no lecture and keep their course.
    for (const workspaceId of [s.boardA, s.boardB]) {
      expect(await api().workspaces.setBoardScope({ workspaceId })).toEqual({ courseTag: 'biology', lectureId: null })
    }
    await expect(api().lectures.deletePreview(s.lectureId)).rejects.toEqual(notFound)
  })

  it('a study block deleted just before, still offered Undo, follows the same rule', async () => {
    const s = await seedLecture()
    await api().planItems.delete(s.review)
    await api().planItems.delete(s.done)
    await api().planItems.delete(s.otherReview)

    const preview = await api().lectures.deletePreview(s.lectureId)
    await api().lectures.delete({ id: s.lectureId, fingerprint: preview.fingerprint })

    // The unfinished one went with its moment: nothing to put back.
    await expect(api().planItems.restore(s.review)).rejects.toEqual(notFound)
    // The finished one comes back, no longer linked to a moment.
    const done = await api().planItems.restore(s.done)
    expect(done).toMatchObject({ id: s.done, status: 'done', source_type: null, source_id: null, source_offset_ms: null })
    // Another lecture's comes back as it was.
    expect(await api().planItems.restore(s.otherReview)).toMatchObject({ source_type: 'recording', source_id: s.otherRec })
  })

  it('refuses a stale preview (CONFLICT) and deletes nothing, files included', async () => {
    const s = await seedLecture()
    const before = await api().lectures.deletePreview(s.lectureId)
    // A transcript part arrives after the student saw the list.
    await sqlAs(alice, (tx) => addSegment(tx, alice, s.recA, 5000))
    const after = await api().lectures.deletePreview(s.lectureId)
    expect(after.fingerprint).not.toBe(before.fingerprint)

    await expect(api().lectures.delete({ id: s.lectureId, fingerprint: before.fingerprint })).rejects.toEqual(conflict)
    expect(await rowsWhere('lectures', 'id', [s.lectureId])).toBe(1)
    expect(await rowsWhere('plan_items', 'id', [s.review])).toBe(1)
    expect(await rowsWhere('tags', 'target_id', [s.segA])).toBe(1)
    expect(existsSync(s.audio.file)).toBe(true)

    await api().lectures.delete({ id: s.lectureId, fingerprint: after.fingerprint })
    expect(await rowsWhere('lectures', 'id', [s.lectureId])).toBe(0)
  })

  it('deletes an empty lecture with nothing to confirm', async () => {
    const lecture = await api().lectures.create({ course: 'physics', title: 'Optics' })
    const preview = await api().lectures.deletePreview(lecture.id)
    expect(preview).toMatchObject({ recordings: { count: 0, durationMs: 0 }, marks: 0, planItems: [], keptPlanItems: 0, resources: { count: 0, files: 0 } })
    await api().lectures.delete({ id: lecture.id })
    expect(await api().lectures.byId(lecture.id)).toBeNull()
    await expect(api().lectures.delete({ id: lecture.id })).rejects.toEqual(notFound)
  })

  it("never reaches another student's lecture", async () => {
    const rec = uid('rec')
    const { lectureId } = await sqlAs(bob, (tx) => insertRecording(tx, { id: rec, userId: bob, title: 'Bob', course: 'biology' }))
    const segment = await sqlAs(bob, (tx) => addSegment(tx, bob, rec, 0))
    await sqlAs(bob, (tx) => tx`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${bob}, 'transcript_segment', ${segment}, 'confused')`)

    await expect(api().lectures.deletePreview(lectureId)).rejects.toEqual(notFound)
    await expect(api().lectures.delete({ id: lectureId })).rejects.toEqual(notFound)
    expect(await rowsWhere('lectures', 'id', [lectureId])).toBe(1)
    expect(await rowsWhere('tags', 'target_id', [segment])).toBe(1)
  })

  it('waits for a write a job is making to a recording, and deletes that too', async () => {
    const rec = uid('rec')
    const { lectureId } = await sqlAs(alice, (tx) => insertRecording(tx, { id: rec, userId: alice, title: 'Summarised' }))
    // A summary being written, as the job does: holding the recording.
    let written!: () => void
    const inserted = new Promise<void>((resolve) => { written = resolve })
    let commit!: () => void
    const committing = new Promise<void>((resolve) => { commit = resolve })
    let holder = 0
    const job = sqlAs(alice, async (tx) => {
      holder = (await tx`SELECT pg_backend_pid() AS pid`)[0].pid as number
      await tx`SELECT 1 FROM recordings WHERE id = ${rec} FOR KEY SHARE`
      await tx`INSERT INTO annotations (user_id, anchor_type, anchor_id, body) VALUES (${alice}, ${LECTURE_SUMMARY_ANCHOR}, ${rec}, 'Late summary')`
      written()
      await committing
    })
    await inserted

    const deleting = api().lectures.delete({ id: lectureId })
    // The delete is waiting for the job's lock on the recording.
    await expect.poll(() => waitingOn(holder)).toBe(1)
    commit()
    await job
    await deleting

    expect(await rowsWhere('recordings', 'id', [rec])).toBe(0)
    expect(await rowsWhere('annotations', 'anchor_id', [rec])).toBe(0)
  })

  describe('AI jobs on a deleted recording', () => {
    const jobRun = { id: randomUUID(), workflow_id: 'wf', workflow_job_id: 'wfj' } as JobRun
    const run = (executors: ReturnType<typeof makeExecutors>, type: string, input: Record<string, unknown>) =>
      executors.execute(type, { ...input, _userId: alice }, { scopeId: null, depth: 1, jobRun })

    it('complete as skipped when the recording is already gone', async () => {
      const executors = makeExecutors(ai)
      const quietSkip = { output: { recording_id: 'rec-gone', skipped: 'recording deleted', quiet: true } }
      expect(await run(executors, 'ai:transcribe', { recording_id: 'rec-gone' })).toEqual(quietSkip)
      expect(await run(executors, 'ai:summarize-lecture', { recording_id: 'rec-gone' })).toEqual(quietSkip)
      expect(await run(executors, REVIEW_TASK_JOB, { target_type: 'transcript_segment', target_id: 'seg-gone' }))
        .toEqual({ output: { skipped: 'moment deleted', quiet: true } })
    })

    it('write nothing when the lecture is deleted while transcribing', async () => {
      // A transcriber that waits until the lecture has been deleted.
      let started!: () => void
      const transcribing = new Promise<void>((resolve) => { started = resolve })
      let finish!: () => void
      const finished = new Promise<void>((resolve) => { finish = resolve })
      const executors = makeExecutors({
        ...ai,
        transcriber: {
          name: 'gated',
          transcribe: async () => {
            started()
            await finished
            return [{ startMs: 0, endMs: 1000, text: 'Too late', speaker: 'Prof' }]
          },
        },
      })
      const rec = uid('rec')
      const { lectureId } = await sqlAs(alice, (tx) =>
        insertRecording(tx, { id: rec, userId: alice, title: 'Upload', status: 'uploaded', audioUrl: audioFile().url }))

      const job = run(executors, 'ai:transcribe', { recording_id: rec })
      await transcribing
      await api().lectures.delete({ id: lectureId })
      finish()

      expect(await job).toEqual({ output: { recording_id: rec, skipped: 'recording deleted', quiet: true } })
      expect(await rowsWhere('transcript_segments', 'recording_id', [rec])).toBe(0)
    })

    it('skip, not fail, when the transcriber finds the audio gone because the lecture was deleted', async () => {
      const rec = uid('rec')
      const audio = audioFile()
      const { lectureId } = await sqlAs(alice, (tx) =>
        insertRecording(tx, { id: rec, userId: alice, title: 'Upload', status: 'uploaded', audioUrl: audio.url }))
      // As a live transcriber that reads the file only once it is under way.
      const executors = makeExecutors({
        ...ai,
        transcriber: {
          name: 'reads-late',
          transcribe: async (file) => {
            await api().lectures.delete({ id: lectureId })
            const { readFile } = await import('node:fs/promises')
            await readFile(file)
            return []
          },
        },
      })
      expect(await run(executors, 'ai:transcribe', { recording_id: rec }))
        .toEqual({ output: { recording_id: rec, skipped: 'recording deleted', quiet: true } })
    })

    it('still fail when the transcriber fails and the recording is there', async () => {
      const rec = uid('rec')
      await sqlAs(alice, (tx) => insertRecording(tx, { id: rec, userId: alice, title: 'Upload', status: 'uploaded', audioUrl: audioFile().url }))
      const executors = makeExecutors({ ...ai, transcriber: { name: 'down', transcribe: async () => { throw new Error('provider down') } } })
      await expect(run(executors, 'ai:transcribe', { recording_id: rec })).rejects.toThrow('provider down')
    })
  })

  it('a course-only scope write racing a delete never puts the deleted lecture back on the board', async () => {
    const rec = uid('rec')
    const { lectureId } = await sqlAs(alice, (tx) => insertRecording(tx, { id: rec, userId: alice, title: 'Race', course: 'biology' }))
    const ws = (await api().workspaces.create({ name: uid('Board') })).id as string
    await api().workspaces.setBoardScope({ workspaceId: ws, lectureId })

    // The delete's own steps, held open before commit: the lecture locked,
    // the board's selection and the lecture gone.
    let deleted!: () => void
    const ready = new Promise<void>((resolve) => { deleted = resolve })
    let commit!: () => void
    const committing = new Promise<void>((resolve) => { commit = resolve })
    let holder = 0
    const deleting = sqlAs(alice, async (tx) => {
      holder = (await tx`SELECT pg_backend_pid() AS pid`)[0].pid as number
      await tx`SELECT id FROM lectures WHERE id = ${lectureId} FOR UPDATE`
      await tx`DELETE FROM workspace_scopes WHERE scope_type = 'lecture' AND scope_value = ${lectureId}`
      await tx`DELETE FROM lectures WHERE id = ${lectureId}`
      deleted()
      await committing
    })
    await ready

    // Meanwhile the board's course is set again: it still sees the lecture
    // (not committed away yet) and would keep it.
    const write = api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'biology' })
    await expect.poll(() => waitingOn(holder)).toBe(1)
    commit()
    await deleting

    expect(await write).toEqual({ courseTag: 'biology', lectureId: null })
    expect(await rowsWhere('workspace_scopes', 'workspace_id', [ws])).toBe(1)
  })
})
