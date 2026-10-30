// @vitest-environment node
/**
 * Lectures of class occurrences (02 phase 3, D7/D8): `forClassOccurrence`,
 * `lectures.create` with `matchClass` (Record during a class), and /upload
 * selecting the lecture it makes. Opt-in like the other db tests: runs only
 * when TEST_DATABASE_URL points at a migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test class-lectures.db
 *
 * Fresh random user ids; rows deleted afterwards. No DDL.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

/** A minimal WAV header: enough for /upload's magic-byte check. */
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(16)])

describe.skipIf(!TEST_DATABASE_URL)('class lectures (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  let handleUpload: typeof import('../upload').handleUpload
  let uploadsDir: string
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`
  const api = () => caller(alice)
  const notFound = expect.objectContaining({ code: 'NOT_FOUND' })
  const badRequest = expect.objectContaining({ code: 'BAD_REQUEST' })

  /**
   * A weekly Biology class, Mondays 10:00-12:00 London, from Mon 19 Oct 2026
   * (BST; the clocks go back on Sun 25 Oct, so Mon 26 Oct is 10:00 GMT).
   */
  let bioClass: string
  /** A weekly Chemistry lab (a commitment with a course, not subtype 'class'), Mondays 11:00-13:00. */
  let chemLab: string
  /** A shift: a commitment with neither a course nor subtype 'class'. */
  let shift: string
  /** A one-off class with no course. */
  let guestTalk: string
  let bobClass: string

  const board = async (courseTag?: string) =>
    (await api().workspaces.create({ name: `Board ${randomUUID().slice(0, 4)}`, courseTag })).id as string
  const storedScope = async (workspaceId: string) =>
    (await db.sql`SELECT scope_type, scope_value FROM workspace_scopes WHERE workspace_id = ${workspaceId} ORDER BY scope_type`)
      .map((r) => [r.scope_type, r.scope_value])
  /** The Monday `weeks` weeks after Mon 19 Oct 2026, as YYYY-MM-DD. */
  const monday = (weeks: number) => new Date(Date.UTC(2026, 9, 19 + weeks * 7)).toISOString().slice(0, 10)
  const lecturesOf = async (classItemId: string) =>
    db.sql`SELECT id, class_date::text AS class_date FROM lectures WHERE class_item_id = ${classItemId} ORDER BY class_date`

  async function upload(userId: string, headers: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
    const req = Object.assign(Readable.from([WAV]), {
      method: 'POST',
      headers: { 'content-type': 'audio/wav', 'x-user-id': userId, 'x-recording-title': 'Upload', ...headers },
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

    const weekly = { freq: 'weekly' as const, timeZone: 'Europe/London' }
    bioClass = (await api().planItems.create({
      kind: 'commitment', title: 'Biology lecture', subtype: 'class', course: 'biology',
      starts_at: '2026-10-19T09:00:00.000Z', ends_at: '2026-10-19T11:00:00.000Z', recurrence: weekly,
    })).id
    chemLab = (await api().planItems.create({
      kind: 'commitment', title: 'Chemistry lab', subtype: 'lab', course: 'chemistry',
      starts_at: '2026-10-19T10:00:00.000Z', ends_at: '2026-10-19T12:00:00.000Z', recurrence: weekly,
    })).id
    shift = (await api().planItems.create({
      kind: 'commitment', title: 'Cafe shift', subtype: 'shift',
      starts_at: '2026-10-19T09:00:00.000Z', ends_at: '2026-10-19T13:00:00.000Z', recurrence: weekly,
    })).id
    guestTalk = (await api().planItems.create({
      kind: 'commitment', title: 'Guest talk', subtype: 'class',
      starts_at: '2026-10-21T17:00:00.000Z', ends_at: '2026-10-21T18:00:00.000Z',
    })).id
    bobClass = (await caller(bob).planItems.create({
      kind: 'commitment', title: 'Bob biology', subtype: 'class', course: 'biology',
      starts_at: '2026-10-19T09:00:00.000Z', ends_at: '2026-10-19T11:00:00.000Z', recurrence: weekly,
    })).id
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'user_provisioning', 'tags', 'workspaces', 'lectures', 'plan_items']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice, bob]])
    }
    await db.sql.end()
    if (uploadsDir) await rm(uploadsDir, { recursive: true, force: true })
  })

  describe('forClassOccurrence', () => {
    it("makes the occurrence's lecture once: linked, named and filed from the class", async () => {
      const first = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-10-26' })
      expect(first.created).toBe(true)
      expect(first.board).toBeNull()
      expect(first.lecture).toMatchObject({
        title: 'Biology lecture · Mon 26 Oct',
        course: 'biology',
        class_item_id: bioClass,
        class_date: '2026-10-26',
        recordings: [],
      })
      // After the clocks went back: 10:00 GMT.
      expect(new Date(first.lecture.starts_at).toISOString()).toBe('2026-10-26T10:00:00.000Z')

      const again = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-10-26' })
      expect(again.created).toBe(false)
      expect(again.lecture.id).toBe(first.lecture.id)
      // byId and list carry the link as a plain date too.
      expect((await api().lectures.byId(first.lecture.id))?.class_date).toBe('2026-10-26')
    })

    it('works for past and future occurrences, and for a class block that is a lab', async () => {
      const past = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-10-19' })
      expect(new Date(past.lecture.starts_at).toISOString()).toBe('2026-10-19T09:00:00.000Z')
      const future = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2027-03-01' })
      expect(future.lecture.class_date).toBe('2027-03-01')
      const lab = await api().lectures.forClassOccurrence({ planItemId: chemLab, date: '2026-11-02' })
      expect(lab.lecture).toMatchObject({ course: 'chemistry', title: 'Chemistry lab · Mon 2 Nov' })
    })

    it('a class with no course gives a lecture with no course', async () => {
      const talk = await api().lectures.forClassOccurrence({ planItemId: guestTalk, date: '2026-10-21' })
      expect(talk.lecture).toMatchObject({ course: null, title: 'Guest talk · Wed 21 Oct' })
    })

    it('is idempotent under concurrent calls: one lecture, every caller gets it', async () => {
      for (let round = 0; round < 5; round++) {
        const date = monday(11 + round)
        const boards = await Promise.all([board(), board('chemistry')])
        const results = await Promise.all([
          ...Array.from({ length: 6 }, () => api().lectures.forClassOccurrence({ planItemId: bioClass, date })),
          ...boards.map((workspaceId) => api().lectures.forClassOccurrence({ planItemId: bioClass, date, workspaceId })),
        ])
        const ids = new Set(results.map((r) => r.lecture.id))
        expect(ids.size).toBe(1)
        expect(results.filter((r) => r.created)).toHaveLength(1)
        expect((await lecturesOf(bioClass)).filter((l) => l.class_date === date)).toHaveLength(1)
        for (const workspaceId of boards) expect(await storedScope(workspaceId)).toEqual([['lecture', [...ids][0]], ['tag', 'biology']])
      }
    })

    it('selects the lecture on the board, course with it, and reports the scope before and after', async () => {
      const ws = await board('chemistry')
      const { lecture, board: scope } = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-11-09', workspaceId: ws })
      expect(scope).toEqual({ before: { courseTag: 'chemistry', lectureId: null }, after: { courseTag: 'biology', lectureId: lecture.id } })
      expect(await storedScope(ws)).toEqual([['lecture', lecture.id], ['tag', 'biology']])
      // Again: nothing changes, and before equals after.
      const again = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-11-09', workspaceId: ws })
      expect(again.board!.before).toEqual(again.board!.after)
    })

    it('rejects a date the class is not on, and a commitment that is not a class', async () => {
      await expect(api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-10-27' })).rejects.toEqual(badRequest)
      // Before the series starts.
      await expect(api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-10-12' })).rejects.toEqual(badRequest)
      await expect(api().lectures.forClassOccurrence({ planItemId: shift, date: '2026-10-26' })).rejects.toEqual(badRequest)
      await expect(api().lectures.forClassOccurrence({ planItemId: bioClass, date: '26/10/2026' })).rejects.toEqual(badRequest)
    })

    it("refuses another student's class or board", async () => {
      await expect(api().lectures.forClassOccurrence({ planItemId: bobClass, date: '2026-10-26' })).rejects.toEqual(notFound)
      const bobBoard = (await caller(bob).workspaces.create({ name: 'Bob board' })).id as string
      await expect(api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-10-26', workspaceId: bobBoard })).rejects.toEqual(notFound)
      expect(await storedScope(bobBoard)).toEqual([])
    })

    it('finds the same lecture after the series moves by an hour (keyed by date)', async () => {
      const item = await api().planItems.create({
        kind: 'commitment', title: 'Physics lecture', subtype: 'class', course: 'physics',
        starts_at: '2026-10-20T09:00:00.000Z', ends_at: '2026-10-20T10:00:00.000Z',
        recurrence: { freq: 'weekly', timeZone: 'Europe/London' },
      })
      const before = await api().lectures.forClassOccurrence({ planItemId: item.id, date: '2026-11-03' })
      await api().planItems.update({ id: item.id, patch: { starts_at: '2026-10-20T10:00:00.000Z', ends_at: '2026-10-20T11:00:00.000Z' } })
      const after = await api().lectures.forClassOccurrence({ planItemId: item.id, date: '2026-11-03' })
      expect(after).toMatchObject({ created: false, lecture: { id: before.lecture.id } })
    })

    it('deleting a class keeps its lectures, on the day they were held', async () => {
      const item = await api().planItems.create({
        kind: 'commitment', title: 'Seminar', subtype: 'class', course: 'physics',
        starts_at: '2026-10-22T14:00:00.000Z', ends_at: '2026-10-22T15:00:00.000Z',
      })
      const { lecture } = await api().lectures.forClassOccurrence({ planItemId: item.id, date: '2026-10-22' })
      await api().planItems.delete(item.id)
      expect(await api().lectures.byId(lecture.id)).toMatchObject({ class_item_id: null, class_date: '2026-10-22', course: 'physics' })
    })
  })

  describe('lectures.create with matchClass (Record)', () => {
    it("during a class of the board course: that occurrence's lecture, selected on the board", async () => {
      const ws = await board('biology')
      // 15 minutes before the class counts as being in it.
      const lecture = await api().lectures.create({ course: 'biology', matchClass: true, workspaceId: ws, startsAt: new Date('2026-11-16T09:46:00Z') })
      expect(lecture).toMatchObject({ class_item_id: bioClass, class_date: '2026-11-16', title: 'Biology lecture · Mon 16 Nov' })
      expect(await storedScope(ws)).toEqual([['lecture', lecture.id], ['tag', 'biology']])
      // A calendar click on that class lands on the same lecture.
      const clicked = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: '2026-11-16' })
      expect(clicked).toMatchObject({ created: false, lecture: { id: lecture.id } })
      // And so does Record again later in the class (another part).
      const again = await api().lectures.create({ course: 'biology', matchClass: true, startsAt: new Date('2026-11-16T11:59:00Z') })
      expect(again.id).toBe(lecture.id)
    })

    it('outside the class, in another course or without matchClass: a fresh lecture', async () => {
      const after = await api().lectures.create({ course: 'biology', matchClass: true, startsAt: new Date('2026-11-23T12:01:00Z'), timeZone: 'Europe/London' })
      expect(after).toMatchObject({ class_item_id: null, title: 'Biology lecture 23 Nov, 12:01' })
      const early = await api().lectures.create({ course: 'biology', matchClass: true, startsAt: new Date('2026-11-23T09:44:00Z') })
      expect(early.class_item_id).toBeNull()
      const physics = await api().lectures.create({ course: 'physics', matchClass: true, startsAt: new Date('2026-11-23T10:30:00Z') })
      expect(physics.class_item_id).toBeNull()
      const unmatched = await api().lectures.create({ course: 'biology', startsAt: new Date('2026-11-23T10:30:00Z') })
      expect(unmatched.class_item_id).toBeNull()
      // A shift is never a class, even on an "All courses" board.
      const unfiled = await api().lectures.create({ course: null, matchClass: true, startsAt: new Date('2026-11-23T12:30:00Z') })
      expect(unfiled.class_item_id).toBeNull()
    })

    it('a lab with a course counts; on an "All courses" board only a class with no course does', async () => {
      const lab = await api().lectures.create({ course: 'chemistry', matchClass: true, startsAt: new Date('2026-11-30T11:15:00Z') })
      expect(lab).toMatchObject({ class_item_id: chemLab, class_date: '2026-11-30' })
      const talk = await api().lectures.create({ course: null, matchClass: true, startsAt: new Date('2026-10-21T17:30:00Z') })
      expect(talk).toMatchObject({ class_item_id: guestTalk, course: null })
      const notBio = await api().lectures.create({ course: null, matchClass: true, startsAt: new Date('2026-11-30T09:30:00Z') })
      expect(notBio.class_item_id).toBeNull()
    })

    it('racing captures and calendar clicks for one occurrence make one lecture', async () => {
      for (let round = 0; round < 5; round++) {
        const date = monday(7 + round)
        const at = new Date(`${date}T10:30:00Z`)
        const boards = await Promise.all([board('biology'), board(), board('physics')])
        const results = await Promise.all([
          ...boards.map((workspaceId) => api().lectures.create({ course: 'biology', matchClass: true, workspaceId, startsAt: at })),
          api().lectures.forClassOccurrence({ planItemId: bioClass, date }).then((r) => r.lecture),
          api().lectures.forClassOccurrence({ planItemId: bioClass, date, workspaceId: boards[0] }).then((r) => r.lecture),
        ])
        expect(new Set(results.map((l) => l.id)).size).toBe(1)
        expect((await lecturesOf(bioClass)).filter((l) => l.class_date === date)).toHaveLength(1)
      }
    })
  })

  describe('/upload selecting the lecture it makes', () => {
    it('selects it on the board when the board has no lecture', async () => {
      const ws = await board('physics')
      const { status, body } = await upload(alice, { 'x-recording-course': 'physics', 'x-workspace-id': ws, 'x-select-on-board': '1' })
      expect(status).toBe(200)
      expect(body.selected).toBe(true)
      expect(await storedScope(ws)).toEqual([['lecture', body.lectureId], ['tag', 'physics']])
    })

    it('leaves a board that shows another lecture alone, but replaces one that is gone', async () => {
      const ws = await board()
      const other = await api().lectures.create({ course: 'chemistry', workspaceId: ws })
      const kept = await upload(alice, { 'x-recording-course': 'biology', 'x-workspace-id': ws, 'x-select-on-board': '1' })
      expect(kept.body.selected).toBe(false)
      expect(await storedScope(ws)).toEqual([['lecture', other.id], ['tag', 'chemistry']])

      await db.sql`DELETE FROM lectures WHERE id = ${other.id}`
      const replaced = await upload(alice, { 'x-recording-course': 'biology', 'x-workspace-id': ws, 'x-select-on-board': '1' })
      expect(replaced.body.selected).toBe(true)
      expect(await storedScope(ws)).toEqual([['lecture', replaced.body.lectureId], ['tag', 'biology']])
    })

    it("selects nothing without the header, into a given lecture, or on another student's board", async () => {
      const ws = await board('physics')
      expect((await upload(alice, { 'x-recording-course': 'physics', 'x-workspace-id': ws })).body.selected).toBe(false)
      expect(await storedScope(ws)).toEqual([['tag', 'physics']])
      const into = await api().lectures.create({ course: 'physics' })
      expect((await upload(alice, { 'x-lecture-id': into.id, 'x-workspace-id': ws, 'x-select-on-board': '1' })).body.selected).toBe(false)
      const bobBoard = (await caller(bob).workspaces.create({ name: 'Bob board 2' })).id as string
      const onBob = await upload(alice, { 'x-workspace-id': bobBoard, 'x-select-on-board': '1' })
      expect(onBob).toMatchObject({ status: 200, body: { selected: false } })
      expect(await storedScope(bobBoard)).toEqual([])
    })
  })
})
