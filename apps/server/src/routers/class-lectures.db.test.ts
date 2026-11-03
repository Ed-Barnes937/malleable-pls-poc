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
  /** Has a time zone preference of her own, set and changed by the tests. */
  const carol = `test-carol-${randomUUID().slice(0, 8)}`
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
    for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'user_provisioning', 'user_preferences', 'tags', 'workspaces', 'lectures', 'plan_items']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice, bob, carol]])
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

  describe('lectures.create selectIfBoardShows (a create that lands late)', () => {
    it('still selects when the board shows what it did when the capture started', async () => {
      const ws = await board()
      const made = await api().lectures.create({ course: 'physics', workspaceId: ws, selectIfBoardShows: null })
      expect(await storedScope(ws)).toEqual([['lecture', made.id], ['tag', 'physics']])
      const next = await api().lectures.create({ course: 'physics', workspaceId: ws, selectIfBoardShows: made.id })
      expect(await storedScope(ws)).toEqual([['lecture', next.id], ['tag', 'physics']])
    })

    it('leaves a board an upload selected meanwhile alone, and still returns the lecture', async () => {
      const ws = await board()
      const uploaded = await upload(alice, { 'x-recording-course': 'physics', 'x-workspace-id': ws, 'x-select-on-board': '1' })
      expect(uploaded.body.selected).toBe(true)
      const late = await api().lectures.create({ course: 'physics', workspaceId: ws, selectIfBoardShows: null })
      expect(late.id).not.toBe(uploaded.body.lectureId)
      expect(await storedScope(ws)).toEqual([['lecture', uploaded.body.lectureId], ['tag', 'physics']])
    })

    it('replaces a lecture that is gone', async () => {
      const ws = await board()
      const gone = await api().lectures.create({ course: 'chemistry', workspaceId: ws })
      await db.sql`DELETE FROM lectures WHERE id = ${gone.id}`
      const made = await api().lectures.create({ course: 'biology', workspaceId: ws, selectIfBoardShows: null })
      expect(await storedScope(ws)).toEqual([['lecture', made.id], ['tag', 'biology']])
    })
  })

  describe('workspaces.restoreBoardScope (Undo after a class focus)', () => {
    it('puts back what the board showed while it still shows what the focus left', async () => {
      const ws = await board('chemistry')
      const { board: change } = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: monday(1), workspaceId: ws })
      expect(await api().workspaces.restoreBoardScope({ workspaceId: ws, to: change!.before, ifBoardShows: change!.after }))
        .toEqual({ restored: true, scope: { courseTag: 'chemistry', lectureId: null } })
      expect(await storedScope(ws)).toEqual([['tag', 'chemistry']])
    })

    it('keeps a change made since, elsewhere, and writes nothing', async () => {
      const ws = await board('chemistry')
      const { board: change } = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: monday(1), workspaceId: ws })
      await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: null })
      expect(await api().workspaces.restoreBoardScope({ workspaceId: ws, to: change!.before, ifBoardShows: change!.after }))
        .toEqual({ restored: false, scope: { courseTag: null, lectureId: null } })
      expect(await storedScope(ws)).toEqual([])
    })

    it('brings back a lecture refiled under another course since, with its course now', async () => {
      const ws = await board()
      const earlier = await api().lectures.create({ course: 'physics', workspaceId: ws })
      const { board: change } = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: monday(2), workspaceId: ws })
      expect(change!.before).toEqual({ courseTag: 'physics', lectureId: earlier.id })
      await api().lectures.update({ id: earlier.id, course: 'chemistry' })
      expect(await api().workspaces.restoreBoardScope({ workspaceId: ws, to: change!.before, ifBoardShows: change!.after }))
        .toEqual({ restored: true, scope: { courseTag: 'chemistry', lectureId: earlier.id } })
    })

    it('puts back just the course when the lecture it showed is gone', async () => {
      const ws = await board()
      const earlier = await api().lectures.create({ course: 'physics', workspaceId: ws })
      const { board: change } = await api().lectures.forClassOccurrence({ planItemId: bioClass, date: monday(3), workspaceId: ws })
      await db.sql`DELETE FROM lectures WHERE id = ${earlier.id}`
      expect(await api().workspaces.restoreBoardScope({ workspaceId: ws, to: change!.before, ifBoardShows: change!.after }))
        .toEqual({ restored: true, scope: { courseTag: 'physics', lectureId: null } })
      expect(await storedScope(ws)).toEqual([['tag', 'physics']])
    })

    it('refuses an unknown course, as setBoardScope does, and writes nothing', async () => {
      const ws = await board('chemistry')
      const none = { courseTag: null, lectureId: null }
      const shown = { courseTag: 'chemistry', lectureId: null }
      await expect(api().workspaces.restoreBoardScope({ workspaceId: ws, to: { courseTag: '<script>nonsense', lectureId: null }, ifBoardShows: shown }))
        .rejects.toMatchObject({ code: 'BAD_REQUEST' })
      await expect(api().workspaces.restoreBoardScope({ workspaceId: ws, to: none, ifBoardShows: { courseTag: '<script>nonsense', lectureId: null } }))
        .rejects.toMatchObject({ code: 'BAD_REQUEST' })
      expect(await storedScope(ws)).toEqual([['tag', 'chemistry']])
    })

    it("is NOT_FOUND on a board that isn't the student's", async () => {
      const ws = await board()
      const none = { courseTag: null, lectureId: null }
      await expect(caller(bob).workspaces.restoreBoardScope({ workspaceId: ws, to: none, ifBoardShows: none })).rejects.toEqual(notFound)
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
  describe('a retried upload (x-upload-id)', () => {
    const recordingsOf = async (userId: string, uploadId: string) =>
      db.sql`SELECT id, lecture_id FROM recordings WHERE user_id = ${userId} AND upload_id = ${uploadId}`

    it('a retry after a lost answer gets the saved recording back: no second recording or lecture', async () => {
      const ws = await board('physics')
      const uploadId = randomUUID()
      const headers = { 'x-recording-course': 'physics', 'x-workspace-id': ws, 'x-select-on-board': '1', 'x-upload-id': uploadId }
      const lecturesBefore = (await api().lectures.list({ courseTag: 'physics' })).length
      const first = await upload(alice, headers)
      const retry = await upload(alice, headers)
      expect(first).toMatchObject({ status: 200, body: { selected: true } })
      expect(retry).toEqual(first)
      expect(await recordingsOf(alice, uploadId)).toEqual([{ id: first.body.id, lecture_id: first.body.lectureId }])
      expect(await api().lectures.list({ courseTag: 'physics' })).toHaveLength(lecturesBefore + 1)

      // Into a given lecture, the same.
      const into = await api().lectures.create({ course: 'physics' })
      const partId = randomUUID()
      const part = await upload(alice, { 'x-lecture-id': into.id, 'x-upload-id': partId })
      expect((await upload(alice, { 'x-lecture-id': into.id, 'x-upload-id': partId })).body.id).toBe(part.body.id)
      expect((await api().lectures.byId(into.id))!.recordings).toHaveLength(1)
    })

    it('says whether the board shows its lecture now, as the first answer would have', async () => {
      const ws = await board('physics')
      const uploadId = randomUUID()
      const headers = { 'x-recording-course': 'physics', 'x-workspace-id': ws, 'x-select-on-board': '1', 'x-upload-id': uploadId }
      const first = await upload(alice, headers)
      await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'physics', lectureId: null })
      expect((await upload(alice, headers)).body).toMatchObject({ id: first.body.id, selected: false })
    })

    it('concurrent tries of one upload save it once', async () => {
      for (let round = 0; round < 5; round++) {
        const ws = await board('chemistry')
        const uploadId = randomUUID()
        const headers = { 'x-recording-course': 'chemistry', 'x-workspace-id': ws, 'x-select-on-board': '1', 'x-upload-id': uploadId }
        const lecturesBefore = (await api().lectures.list({ courseTag: 'chemistry' })).length
        const tries = await Promise.all(Array.from({ length: 4 }, () => upload(alice, headers)))
        expect(tries.map((t) => t.status)).toEqual([200, 200, 200, 200])
        expect(new Set(tries.map((t) => t.body.id)).size).toBe(1)
        expect(await recordingsOf(alice, uploadId)).toHaveLength(1)
        expect(await api().lectures.list({ courseTag: 'chemistry' })).toHaveLength(lecturesBefore + 1)
        expect(await storedScope(ws)).toEqual([['lecture', tries[0].body.lectureId], ['tag', 'chemistry']])
      }
    })

    it('is per student, and rejects a malformed id', async () => {
      const uploadId = randomUUID()
      const mine = await upload(alice, { 'x-upload-id': uploadId })
      const bobs = await upload(bob, { 'x-upload-id': uploadId })
      expect(bobs.status).toBe(200)
      expect(bobs.body.id).not.toBe(mine.body.id)
      expect(await recordingsOf(bob, uploadId)).toHaveLength(1)
      expect((await upload(alice, { 'x-upload-id': 'not ok!' })).status).toBe(400)
      expect((await upload(alice, { 'x-upload-id': 'x'.repeat(65) })).status).toBe(400)
    })
  })

  describe('a one-off class keeps the zone it was made in', () => {
    // Tue 3 Nov 2026, 22:00-23:00 in New York: Wed 4 Nov in London and UTC.
    const oneOff = {
      kind: 'commitment' as const, title: 'Night seminar', subtype: 'class', course: 'physics',
      starts_at: '2026-11-04T03:00:00.000Z', ends_at: '2026-11-04T04:00:00.000Z',
    }

    it('is dated in it whatever zone asks later, so Record and the calendar find one lecture', async () => {
      const as = caller(carol)
      // No preference yet: the browser's zone is kept.
      const made = await as.planItems.create({ ...oneOff, timeZone: 'America/New_York' })
      expect(made.time_zone).toBe('America/New_York')
      const fromCalendar = await as.lectures.forClassOccurrence({ planItemId: made.id, date: '2026-11-03', timeZone: 'Europe/London' })
      expect(fromCalendar.lecture).toMatchObject({ class_item_id: made.id, class_date: '2026-11-03', title: 'Night seminar · Tue 3 Nov' })

      // She sets Tokyo later: Record during the class, and a calendar click, land on the same lecture.
      await as.preferences.update({ time_zone: 'Asia/Tokyo' })
      const fromRecord = await as.lectures.create({ course: 'physics', matchClass: true, startsAt: new Date('2026-11-04T03:30:00Z') })
      expect(fromRecord.id).toBe(fromCalendar.lecture.id)
      const again = await as.lectures.forClassOccurrence({ planItemId: made.id, date: '2026-11-03' })
      expect(again).toMatchObject({ created: false, lecture: { id: fromCalendar.lecture.id } })
      await expect(as.lectures.forClassOccurrence({ planItemId: made.id, date: '2026-11-04' })).rejects.toMatchObject(badRequest)
      expect(await lecturesOf(made.id)).toHaveLength(1)

      // Edits keep the zone; a new item takes her preference over the browser's.
      const edited = await as.planItems.update({ id: made.id, patch: { title: 'Night seminar (new room)' }, timeZone: 'Europe/London' })
      expect(edited.time_zone).toBe('America/New_York')
      expect((await as.planItems.create({ ...oneOff, timeZone: 'America/New_York' })).time_zone).toBe('Asia/Tokyo')
    })

    it("an item from before items kept a zone takes the student's on its first edit", async () => {
      const as = caller(carol)
      const item = await as.planItems.create(oneOff)
      await db.sql`UPDATE plan_items SET time_zone = NULL WHERE id = ${item.id}`
      expect((await as.planItems.byId(item.id))!.time_zone).toBeNull()
      const edited = await as.planItems.update({ id: item.id, patch: { title: 'Renamed' }, timeZone: 'America/New_York' })
      expect(edited.time_zone).toBe('Asia/Tokyo')
    })
  })

  describe('find-or-create when the lecture is deleted between its insert and its read', () => {
    it('makes it again instead of failing', async () => {
      const { findOrCreateClassLecture } = await import('./_class-lectures')
      const date = monday(40)
      const existing = await api().lectures.forClassOccurrence({ planItemId: bioClass, date })
      let deletedUnderIt = false
      const result = await db.withUser(alice, (tx) => {
        // The insert finds the committed lecture and does nothing; before the
        // read that follows, another connection deletes it.
        const racing = new Proxy(tx, {
          apply(target, thisArg, args: unknown[]) {
            const query = Reflect.apply(target, thisArg, args) as unknown
            const strings = args[0]
            if (deletedUnderIt || !Array.isArray(strings) || !strings.join('').includes('INSERT INTO lectures')) return query
            return (query as Promise<unknown[]>).then(async (rows) => {
              if (rows.length === 0) {
                await db.sql`DELETE FROM lectures WHERE id = ${existing.lecture.id}`
                deletedUnderIt = true
              }
              return rows
            })
          },
        })
        return findOrCreateClassLecture(racing, alice, bioClass, date, 'Europe/London')
      })
      expect(deletedUnderIt).toBe(true)
      expect(result.created).toBe(true)
      expect(result.id).not.toBe(existing.lecture.id)
      expect((await lecturesOf(bioClass)).filter((l) => l.class_date === date).map((l) => l.id)).toEqual([result.id])
    })
  })
})
