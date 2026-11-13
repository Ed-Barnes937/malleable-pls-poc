// @vitest-environment node
/**
 * Lectures and board scope against a real Postgres, opt-in like
 * workspaces.db.test.ts: runs only when TEST_DATABASE_URL points at a
 * migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test lectures.db
 *
 * The lectures migration itself is tested in lectures-migration.db.test.ts,
 * on a database of its own.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { insertRecording } from '../test-support/recordings'
import { lockProbes } from '../test-support/locks'
import { insertStarterCourses } from '../test-support/courses'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('lectures (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`
  const bioRec = `rec-bio-${alice}`
  const chemRec = `rec-chem-${alice}`
  const unfiledRec = `rec-unfiled-${alice}`
  const bobRec = `rec-${bob}`
  let bio: string
  let chem: string
  let unfiled: string
  let bobLecture: string
  let locks: ReturnType<typeof lockProbes>

  const notFound = expect.objectContaining({ code: 'NOT_FOUND' })
  const badRequest = expect.objectContaining({ code: 'BAD_REQUEST' })
  const api = () => caller(alice)
  /** A fresh board of Alice's, optionally with a course. */
  const board = async (courseTag?: string) =>
    (await api().workspaces.create({ name: `Board ${randomUUID().slice(0, 4)}`, courseTag })).id as string
  /** The board's stored scope rows, past row-level security. */
  const storedScope = async (workspaceId: string) =>
    (await db.sql`SELECT scope_type, scope_value FROM workspace_scopes WHERE workspace_id = ${workspaceId} ORDER BY scope_type`)
      .map((r) => [r.scope_type, r.scope_value])

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    await insertStarterCourses(db.sql, alice, bob)
    locks = lockProbes(db.sql)
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
    await db.withUser(alice, async (tx) => {
      bio = (await insertRecording(tx, { id: bioRec, userId: alice, title: 'Cells', course: 'biology' })).lectureId
      chem = (await insertRecording(tx, { id: chemRec, userId: alice, title: 'Alkenes', course: 'chemistry' })).lectureId
      unfiled = (await insertRecording(tx, { id: unfiledRec, userId: alice, title: 'Guest talk' })).lectureId
    })
    await db.withUser(bob, async (tx) => {
      bobLecture = (await insertRecording(tx, { id: bobRec, userId: bob, title: 'Bob', course: 'biology' })).lectureId
    })
  })

  afterAll(async () => {
    if (!db) return
    // Scopes cascade with their board, recordings with their lecture.
    await db.sql`DELETE FROM workspaces WHERE user_id = ANY(${[alice, bob]})`
    await db.sql`DELETE FROM lectures WHERE user_id = ANY(${[alice, bob]})`
    await db.sql`DELETE FROM tags WHERE user_id = ANY(${[alice, bob]})`
    await db.sql.end()
  })

  describe('setBoardScope', () => {
    it('on a board with a course, selecting a lecture brings its course, in one write', async () => {
      const ws = await board('biology')
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: chem })).toEqual({ courseTag: 'chemistry', lectureId: chem })
      expect(await storedScope(ws)).toEqual([['lecture', chem], ['tag', 'chemistry']])
    })

    it('selecting a lecture filed under no course makes the board "All courses"', async () => {
      const ws = await board('biology')
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: unfiled })).toEqual({ courseTag: null, lectureId: unfiled })
      expect(await storedScope(ws)).toEqual([['lecture', unfiled]])
    })

    it('on an "All courses" board, selecting a lecture keeps "All courses"', async () => {
      const ws = await board()
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: chem })).toEqual({ courseTag: null, lectureId: chem })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bio })).toEqual({ courseTag: null, lectureId: bio })
      expect(await storedScope(ws)).toEqual([['lecture', bio]])
      // Naming "All courses" with the lecture is the same, from any board.
      const course = await board('physics')
      expect(await api().workspaces.setBoardScope({ workspaceId: course, courseTag: null, lectureId: chem }))
        .toEqual({ courseTag: null, lectureId: chem })
    })

    it('accepts a lecture with its own course, and rejects one with another course, writing nothing', async () => {
      const ws = await board('biology')
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'biology', lectureId: bio }))
        .toEqual({ courseTag: 'biology', lectureId: bio })
      await expect(api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'physics', lectureId: chem })).rejects.toEqual(badRequest)
      expect(await storedScope(ws)).toEqual([['lecture', bio], ['tag', 'biology']])
    })

    it('a course change keeps a lecture in it and clears one outside it', async () => {
      const ws = await board()
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bio })
      expect(await storedScope(ws)).toEqual([['lecture', bio]])
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'biology' })).toEqual({ courseTag: 'biology', lectureId: bio })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'chemistry' })).toEqual({ courseTag: 'chemistry', lectureId: null })
      expect(await storedScope(ws)).toEqual([['tag', 'chemistry']])
    })

    it('changing to "All courses" keeps the lecture, and so does staying "All courses"', async () => {
      const ws = await board('biology')
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bio })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: null })).toEqual({ courseTag: null, lectureId: bio })
      expect(await storedScope(ws)).toEqual([['lecture', bio]])
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: unfiled })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: null })).toEqual({ courseTag: null, lectureId: unfiled })
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: chem })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: null })).toEqual({ courseTag: null, lectureId: chem })
    })

    it('clearing the lecture keeps the course; an empty patch changes nothing', async () => {
      const ws = await board('biology')
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bio })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws })).toEqual({ courseTag: 'biology', lectureId: bio })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: null })).toEqual({ courseTag: 'biology', lectureId: null })
      expect(await storedScope(ws)).toEqual([['tag', 'biology']])
    })

    it("another student's lecture or board is NOT_FOUND and nothing is written", async () => {
      const ws = await board('chemistry')
      await expect(api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bobLecture })).rejects.toEqual(notFound)
      await expect(caller(bob).workspaces.setBoardScope({ workspaceId: ws, courseTag: 'biology' })).rejects.toEqual(notFound)
      await expect(api().workspaces.setBoardScope({ workspaceId: ws, lectureId: 'lec-missing' })).rejects.toEqual(notFound)
      expect(await storedScope(ws)).toEqual([['tag', 'chemistry']])
    })

    it('rejects a course that is not one of the courses', async () => {
      const ws = await board()
      await expect(api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'astrology' })).rejects.toEqual(badRequest)
    })

    it('workspaces.create takes only a course key, and creates no board otherwise', async () => {
      const name = `Astrology ${randomUUID().slice(0, 4)}`
      await expect(api().workspaces.create({ name, courseTag: 'astrology' })).rejects.toEqual(badRequest)
      expect((await api().workspaces.list()).map((w) => w.name)).not.toContain(name)
      expect(await storedScope(await board('physics'))).toEqual([['tag', 'physics']])
    })

    it('concurrent scope writes to one board leave one row per dimension and keep the rule', async () => {
      const physics = await api().lectures.create({ course: 'physics', title: 'Race' })
      for (let round = 0; round < 10; round++) {
        const ws = await board('biology')
        await Promise.all([
          api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bio }),
          api().workspaces.setBoardScope({ workspaceId: ws, lectureId: chem }),
          api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'chemistry' }),
          api().workspaces.setBoardScope({ workspaceId: ws, lectureId: unfiled }),
          api().lectures.create({ course: 'chemistry', title: `Race ${round}`, workspaceId: ws }),
          api().workspaces.setBoardScope({ workspaceId: ws, lectureId: physics.id }),
          api().lectures.update({ id: physics.id, course: round % 2 ? 'physics' : 'chemistry' }),
        ])
        const rows = await storedScope(ws)
        const types = rows.map(([type]) => type)
        expect(types).toEqual([...new Set(types)])
        const lectureId = rows.find(([type]) => type === 'lecture')?.[1] ?? null
        const course = rows.find(([type]) => type === 'tag')?.[1] ?? null
        // A board with a course shows only a lecture of it; "All courses" may show any.
        if (lectureId && course) expect(course).toBe((await api().lectures.byId(lectureId))!.course)
      }
    })

    /** Two fresh boards of Alice's, in the order a course change locks them. */
    const twoBoards = async (courseTag?: string) => locks.inLockOrder([await board(courseTag), await board(courseTag)])

    it('a lecture moving course while another board selects it leaves no board showing it under its old course', async () => {
      const moving = await api().lectures.create({ course: 'physics', title: 'Moving' })
      const showing = await board('physics')
      await api().workspaces.setBoardScope({ workspaceId: showing, lectureId: moving.id })
      const selecting = await board('physics')

      // A scope write on the board already showing it is under way, so the
      // course change waits partway, for that board.
      const holder = await locks.holdBoard(showing)
      try {
        const update = api().lectures.update({ id: moving.id, course: 'chemistry' })
        await expect.poll(async () => (await locks.waiting(holder.pid)).on_it).toBe(1)

        // Meanwhile another board selects the lecture, and the change goes on.
        const { outcome: selection } = await locks.settledOrBehind(holder.pid, () =>
          api().workspaces.setBoardScope({ workspaceId: selecting, lectureId: moving.id }))
        await holder.release()
        await Promise.all([update, selection])
      } finally {
        await holder.release()
      }

      for (const ws of [showing, selecting]) {
        expect(await storedScope(ws)).toEqual([['lecture', moving.id], ['tag', 'chemistry']])
      }
    })

    it('a lecture moving course leaves alone a board that a scope write is moving off it', async () => {
      const moving = await api().lectures.create({ course: 'physics', title: 'Moving off' })
      const leaving = await board('physics')
      await api().workspaces.setBoardScope({ workspaceId: leaving, lectureId: moving.id })

      // A scope write clearing the lecture has written its rows, not yet committed.
      let pid = 0
      let wrote!: () => void
      const written = new Promise<void>((done) => { wrote = done })
      let commit!: () => void
      const committing = new Promise<void>((done) => { commit = done })
      const clearing = db.sql.begin(async (tx) => {
        pid = (await tx`SELECT pg_backend_pid() AS pid`)[0].pid as number
        await tx`SELECT id FROM workspaces WHERE id = ${leaving} FOR NO KEY UPDATE`
        await tx`DELETE FROM workspace_scopes WHERE workspace_id = ${leaving} AND scope_type = 'lecture'`
        wrote()
        await committing
      })
      await written
      try {
        const update = api().lectures.update({ id: moving.id, course: 'chemistry' })
        await expect.poll(async () => (await locks.waiting(pid)).on_it).toBe(1)
        commit()
        await Promise.all([clearing, update])
      } finally {
        commit()
        await clearing
      }

      expect(await storedScope(leaving)).toEqual([['tag', 'physics']])
    })

    it('an Undo putting back a lecture while it moves course puts it back with its new course', async () => {
      const moving = await api().lectures.create({ course: 'physics', title: 'Moving back' })
      const showing = await board('physics')
      await api().workspaces.setBoardScope({ workspaceId: showing, lectureId: moving.id })
      // The board showed the lecture, then a change cleared it: Undo puts it back.
      const undoing = await board('physics')
      const to = await api().workspaces.setBoardScope({ workspaceId: undoing, lectureId: moving.id })
      const ifBoardShows = await api().workspaces.setBoardScope({ workspaceId: undoing, lectureId: null })

      const holder = await locks.holdBoard(showing)
      let restored
      try {
        const update = api().lectures.update({ id: moving.id, course: 'chemistry' })
        await expect.poll(async () => (await locks.waiting(holder.pid)).on_it).toBe(1)

        const { outcome: undo } = await locks.settledOrBehind(holder.pid, () =>
          api().workspaces.restoreBoardScope({ workspaceId: undoing, to, ifBoardShows }))
        await holder.release()
        ;[, restored] = await Promise.all([update, undo])
      } finally {
        await holder.release()
      }

      expect(restored).toEqual({ restored: true, scope: { courseTag: 'chemistry', lectureId: moving.id } })
      for (const ws of [showing, undoing]) {
        expect(await storedScope(ws)).toEqual([['lecture', moving.id], ['tag', 'chemistry']])
      }
    })

    it('a board changing course while its lecture moves course keeps the lecture only if it is in the new course', async () => {
      const moving = await api().lectures.create({ course: 'physics', title: 'Moving, board narrowing' })
      const showing = await board('physics')
      await api().workspaces.setBoardScope({ workspaceId: showing, lectureId: moving.id })
      // An "All courses" board showing the lecture, about to narrow to its old course.
      const narrowing = await board()
      await api().workspaces.setBoardScope({ workspaceId: narrowing, lectureId: moving.id })

      const holder = await locks.holdBoard(showing)
      try {
        const update = api().lectures.update({ id: moving.id, course: 'chemistry' })
        await expect.poll(async () => (await locks.waiting(holder.pid)).on_it).toBe(1)

        const { outcome: narrowed } = await locks.settledOrBehind(holder.pid, () =>
          api().workspaces.setBoardScope({ workspaceId: narrowing, courseTag: 'physics' }))
        await holder.release()
        await Promise.all([update, narrowed])
      } finally {
        await holder.release()
      }

      // The lecture is in chemistry now, so physics doesn't keep it.
      expect(await storedScope(narrowing)).toEqual([['tag', 'physics']])
      expect(await storedScope(showing)).toEqual([['lecture', moving.id], ['tag', 'chemistry']])
    })

    it('a board moving to another lecture while a course change refiles it does not deadlock', async () => {
      const moving = await api().lectures.create({ course: 'physics', title: 'Moving, board moving on' })
      const next = await api().lectures.create({ course: 'chemistry', title: 'Next' })
      const [first, second] = await twoBoards('physics')
      for (const ws of [first, second]) await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: moving.id })

      // The course change has locked the first board's lecture row and waits for the second's.
      const holder = await locks.holdLectureRow(second)
      try {
        const update = api().lectures.update({ id: moving.id, course: 'chemistry' })
        await expect.poll(async () => (await locks.waiting(holder.pid)).on_it).toBe(1)

        // The first board moves on, and waits for the change at its lecture row.
        const { outcome: moved } = await locks.settledOrBehind(holder.pid, () =>
          api().workspaces.setBoardScope({ workspaceId: first, lectureId: next.id }))
        await holder.release()
        await Promise.all([update, moved])
      } finally {
        await holder.release()
      }

      expect(await storedScope(first)).toEqual([['lecture', next.id], ['tag', 'chemistry']])
      expect(await storedScope(second)).toEqual([['lecture', moving.id], ['tag', 'chemistry']])
    })

    it('the database refuses a second row of one dimension', async () => {
      const ws = await board('biology')
      await expect(db.sql`
        INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value) VALUES (${alice}, ${ws}, 'tag', 'physics')
      `).rejects.toThrow(/uq_workspace_scopes_dimension/)
    })
  })

  it('a course is not a tag on a recording: tags.create refuses one', async () => {
    await expect(api().tags.create({ target_type: 'recording', target_id: bioRec, label: 'chemistry' })).rejects.toEqual(badRequest)
    await api().tags.create({ target_type: 'recording', target_id: bioRec, label: 'favourite' })
    expect(await api().lectures.byId(bio)).toMatchObject({ course: 'biology' })
  })

  describe('workspaces.scopes', () => {
    it('returns the stored course and lecture rows only (no recording row)', async () => {
      const ws = await board('chemistry')
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bio })
      const rows = await api().workspaces.scopes(ws)
      expect(rows.map((r) => [r.scope_type, r.scope_value])).toEqual([['lecture', bio], ['tag', 'biology']])
    })

    it('the per-dimension setScope is gone: setBoardScope is the one scope write', async () => {
      const { appRouter } = await import('../router')
      const procedures = appRouter._def.procedures as Record<string, unknown>
      expect(procedures['workspaces.setScope']).toBeUndefined()
      expect(procedures['workspaces.setBoardScope']).toBeDefined()
    })
  })

  describe('lectures router', () => {
    it('lists the student\'s lectures latest first, with their recordings, optionally by course', async () => {
      const all = await api().lectures.list()
      expect(all.map((l) => l.id)).toEqual(expect.arrayContaining([bio, chem, unfiled]))
      expect(all.map((l) => l.id)).not.toContain(bobLecture)
      const starts = all.map((l) => new Date(l.starts_at).getTime())
      expect(starts).toEqual([...starts].sort((a, b) => b - a))

      const biology = await api().lectures.list({ courseTag: 'biology' })
      expect(biology.map((l) => l.id)).toEqual([bio])
      expect(biology[0]).toMatchObject({
        title: 'Cells', course: 'biology', class_item_id: null, class_date: null,
        recordings: [expect.objectContaining({ id: bioRec, title: 'Cells', status: 'ready' })],
      })
    })

    it("byId returns a lecture with its recordings, or null for another student's", async () => {
      expect(await api().lectures.byId(unfiled)).toMatchObject({ id: unfiled, course: null, recordings: [expect.objectContaining({ id: unfiledRec })] })
      expect(await api().lectures.byId(bobLecture)).toBeNull()
    })

    it('create names a lecture from its course and start time unless given a title', async () => {
      const startsAt = new Date('2026-10-30T10:04:00Z')
      const named = await api().lectures.create({ course: 'biology', startsAt, timeZone: 'UTC' })
      expect(named).toMatchObject({ title: 'Biology lecture 30 Oct, 10:04', course: 'biology', recordings: [] })
      const titled = await api().lectures.create({ course: null, title: '  Guest lecture ' })
      expect(titled).toMatchObject({ title: 'Guest lecture', course: null })
      await expect(api().lectures.create({ course: 'astrology' })).rejects.toEqual(badRequest)
    })

    it('create with a board selects the lecture there, course and all, in the same transaction', async () => {
      const ws = await board('biology')
      const lecture = await api().lectures.create({ course: 'chemistry', title: 'Lab', workspaceId: ws })
      expect(await storedScope(ws)).toEqual([['lecture', lecture.id], ['tag', 'chemistry']])
    })

    it('create on an "All courses" board selects the lecture and the board stays "All courses"', async () => {
      const ws = await board()
      const lecture = await api().lectures.create({ course: 'chemistry', title: 'Lab', workspaceId: ws })
      expect(await storedScope(ws)).toEqual([['lecture', lecture.id]])
    })

    it("create on another student's board is NOT_FOUND and creates nothing", async () => {
      const ws = await board()
      await expect(caller(bob).lectures.create({ course: null, title: 'Sneaky', workspaceId: ws })).rejects.toEqual(notFound)
      expect((await caller(bob).lectures.list()).map((l) => l.title)).not.toContain('Sneaky')
    })

    it('update renames, and a course change re-scopes every board with a course that has the lecture selected', async () => {
      const lecture = await api().lectures.create({ course: 'biology', title: 'Old name' })
      const selected = await board('biology')
      const other = await board('biology')
      const allCourses = await board()
      await api().workspaces.setBoardScope({ workspaceId: selected, lectureId: lecture.id })
      await api().workspaces.setBoardScope({ workspaceId: allCourses, lectureId: lecture.id })

      expect(await api().lectures.update({ id: lecture.id, title: 'New name' })).toMatchObject({ title: 'New name', course: 'biology' })
      const moved = await api().lectures.update({ id: lecture.id, course: 'physics' })
      expect(moved).toMatchObject({ title: 'New name', course: 'physics' })
      expect(await storedScope(selected)).toEqual([['lecture', lecture.id], ['tag', 'physics']])
      expect(await storedScope(other)).toEqual([['tag', 'biology']])
      expect(await storedScope(allCourses)).toEqual([['lecture', lecture.id]])

      // Unfiling it turns a course board showing it into "All courses", as
      // selecting a lecture filed under no course does.
      await api().lectures.update({ id: lecture.id, course: null })
      expect(await storedScope(selected)).toEqual([['lecture', lecture.id]])
      expect(await storedScope(allCourses)).toEqual([['lecture', lecture.id]])
    })

    it("update of another student's lecture is NOT_FOUND", async () => {
      await expect(caller(bob).lectures.update({ id: bio, title: 'Mine now' })).rejects.toEqual(notFound)
      expect(await api().lectures.byId(bio)).toMatchObject({ title: 'Cells' })
    })
  })

  it("a recording's course is its lecture's: course filters follow the lecture", async () => {
    const before = await api().recordings.list({ courseTag: 'chemistry' })
    expect(before.map((r) => r.id)).toEqual([chemRec])
    expect(before[0]).toMatchObject({ lecture_id: chem, course: 'chemistry' })
    await api().lectures.update({ id: chem, course: 'physics' })
    expect(await api().recordings.list({ courseTag: 'chemistry' })).toEqual([])
    expect((await api().recordings.list({ courseTag: 'physics' })).map((r) => r.id)).toEqual([chemRec])
    await api().lectures.update({ id: chem, course: 'chemistry' })
  })

  it('deleting a lecture deletes its recordings', async () => {
    const gone = `rec-gone-${alice}`
    const { lectureId } = await db.withUser(alice, (tx) => insertRecording(tx, { id: gone, userId: alice, title: 'Gone' }))
    await db.withUser(alice, (tx) => tx`DELETE FROM lectures WHERE id = ${lectureId}`)
    expect(await api().recordings.byId(gone)).toBeNull()
  })
})
