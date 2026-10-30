// @vitest-environment node
/**
 * Lectures and board scope against a real Postgres, opt-in like
 * workspaces.db.test.ts: runs only when TEST_DATABASE_URL points at a
 * migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test lectures.db
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { insertRecording } from '../test-support/recordings'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const MIGRATION = readFileSync(resolve(__dirname, '../../../../packages/db/src/migrations/017_lectures.sql'), 'utf-8')

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
    await db.sql.end()
  })

  describe('setBoardScope', () => {
    it('selecting a lecture brings its course, in one write', async () => {
      const ws = await board('biology')
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: chem })).toEqual({ courseTag: 'chemistry', lectureId: chem })
      expect(await storedScope(ws)).toEqual([['lecture', chem], ['tag', 'chemistry']])
    })

    it('selecting a lecture filed under no course makes the board "All courses"', async () => {
      const ws = await board('biology')
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: unfiled })).toEqual({ courseTag: null, lectureId: unfiled })
      expect(await storedScope(ws)).toEqual([['lecture', unfiled]])
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
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'biology' })).toEqual({ courseTag: 'biology', lectureId: bio })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: 'chemistry' })).toEqual({ courseTag: 'chemistry', lectureId: null })
      expect(await storedScope(ws)).toEqual([['tag', 'chemistry']])
    })

    it('"All courses" clears a lecture that has a course and keeps one filed under none', async () => {
      const ws = await board()
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bio })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: null })).toEqual({ courseTag: null, lectureId: null })
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: unfiled })
      expect(await api().workspaces.setBoardScope({ workspaceId: ws, courseTag: null })).toEqual({ courseTag: null, lectureId: unfiled })
    })

    it('clearing the lecture keeps the course; an empty patch changes nothing', async () => {
      const ws = await board()
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
  })

  describe('the recording focus shim (current client)', () => {
    it('scopes returns a lecture row and, for the client, its latest recording as a recording row', async () => {
      const ws = await board()
      await api().workspaces.setBoardScope({ workspaceId: ws, lectureId: bio })
      const rows = await api().workspaces.scopes(ws)
      expect(rows.map((r) => [r.scope_type, r.scope_value]).sort()).toEqual([
        ['lecture', bio], ['recording', bioRec], ['tag', 'biology'],
      ])
    })

    it('a lecture with no audio yet gives no recording row', async () => {
      const ws = await board()
      const empty = await api().lectures.create({ course: null, title: 'Not yet', workspaceId: ws })
      const rows = await api().workspaces.scopes(ws)
      expect(rows.map((r) => [r.scope_type, r.scope_value])).toEqual([['lecture', empty.id]])
    })

    it('setScope recording selects its lecture without changing the course, as before', async () => {
      const ws = await board('biology')
      await api().workspaces.setScope({ workspaceId: ws, scopeType: 'recording', scopeValue: chemRec })
      expect(await storedScope(ws)).toEqual([['lecture', chem], ['tag', 'biology']])
      // "All courses" keeps it; a course outside it clears it.
      await api().workspaces.setScope({ workspaceId: ws, scopeType: 'tag', scopeValue: null })
      expect(await storedScope(ws)).toEqual([['lecture', chem]])
      await api().workspaces.setScope({ workspaceId: ws, scopeType: 'tag', scopeValue: 'physics' })
      expect(await storedScope(ws)).toEqual([['tag', 'physics']])
      await api().workspaces.setScope({ workspaceId: ws, scopeType: 'recording', scopeValue: bioRec })
      await api().workspaces.setScope({ workspaceId: ws, scopeType: 'recording', scopeValue: null })
      expect(await storedScope(ws)).toEqual([['tag', 'physics']])
    })

    it("setScope on another student's recording is NOT_FOUND", async () => {
      const ws = await board()
      await expect(api().workspaces.setScope({ workspaceId: ws, scopeType: 'recording', scopeValue: bobRec })).rejects.toEqual(notFound)
      expect(await storedScope(ws)).toEqual([])
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

    it("create on another student's board is NOT_FOUND and creates nothing", async () => {
      const ws = await board()
      await expect(caller(bob).lectures.create({ course: null, title: 'Sneaky', workspaceId: ws })).rejects.toEqual(notFound)
      expect((await caller(bob).lectures.list()).map((l) => l.title)).not.toContain('Sneaky')
    })

    it('update renames, and a course change re-scopes every board that has the lecture selected', async () => {
      const lecture = await api().lectures.create({ course: 'biology', title: 'Old name' })
      const selected = await board()
      const other = await board('biology')
      await api().workspaces.setBoardScope({ workspaceId: selected, lectureId: lecture.id })

      expect(await api().lectures.update({ id: lecture.id, title: 'New name' })).toMatchObject({ title: 'New name', course: 'biology' })
      const moved = await api().lectures.update({ id: lecture.id, course: 'physics' })
      expect(moved).toMatchObject({ title: 'New name', course: 'physics' })
      expect(await storedScope(selected)).toEqual([['lecture', lecture.id], ['tag', 'physics']])
      expect(await storedScope(other)).toEqual([['tag', 'biology']])

      await api().lectures.update({ id: lecture.id, course: null })
      expect(await storedScope(selected)).toEqual([['lecture', lecture.id]])
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

  describe('migration 017', () => {
    /** Runs `body` in a transaction that is always rolled back. */
    async function rolledBack(body: (tx: import('@pls/db').TxSql) => Promise<void>) {
      const rollback = new Error('rollback')
      await expect(db.sql.begin(async (tx) => {
        await body(tx as unknown as import('@pls/db').TxSql)
        throw rollback
      })).rejects.toBe(rollback)
    }

    it('gives each pre-017 recording a lecture with its course, drops the course tags and moves board focus to the lecture', async () => {
      const carol = `test-carol-${randomUUID().slice(0, 8)}`
      await rolledBack(async (tx) => {
        // Data as it was before 017: no lecture, course as a 'recording' tag.
        await tx.unsafe('ALTER TABLE recordings ALTER COLUMN lecture_id DROP NOT NULL')
        await tx`
          INSERT INTO recordings (id, user_id, title, created_at) VALUES
            ('rec-a', ${carol}, 'Cells', '2026-04-01T10:00:00Z'),
            ('rec-b', ${carol}, 'Untagged', '2026-04-02T10:00:00Z'),
            ('rec-c', ${carol}, '', '2026-04-03T10:00:00Z')
        `
        await tx`
          INSERT INTO tags (id, user_id, target_type, target_id, label, created_at) VALUES
            ('t-fav', ${carol}, 'recording', 'rec-a', 'favourite', '2026-04-01T09:00:00Z'),
            ('t-chem', ${carol}, 'recording', 'rec-a', 'chemistry', '2026-04-01T10:00:01Z'),
            ('t-bio', ${carol}, 'recording', 'rec-a', 'biology', '2026-04-01T10:00:02Z')
        `
        const [ws] = await tx`INSERT INTO workspaces (user_id, name) VALUES (${carol}, 'Board') RETURNING id`
        await tx`
          INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value) VALUES
            (${carol}, ${ws.id}, 'tag', 'biology'),
            (${carol}, ${ws.id}, 'recording', 'rec-a')
        `
        const [ws2] = await tx`INSERT INTO workspaces (user_id, name) VALUES (${carol}, 'Stale') RETURNING id`
        await tx`INSERT INTO workspace_scopes (user_id, workspace_id, scope_type, scope_value) VALUES (${carol}, ${ws2.id}, 'recording', 'rec-deleted')`

        await tx.unsafe(MIGRATION)
        // Idempotent: e2e/reseed.ts runs it again on a migrated database.
        await tx.unsafe(MIGRATION)

        const lectures = await tx`SELECT id, title, course, starts_at FROM lectures WHERE user_id = ${carol} ORDER BY id`
        expect(lectures.map((l) => [l.id, l.title, l.course, (l.starts_at as Date).toISOString()])).toEqual([
          // The first course tag wins, as recordingCourse did.
          ['lec-rec-a', 'Cells', 'chemistry', '2026-04-01T10:00:00.000Z'],
          ['lec-rec-b', 'Untagged', null, '2026-04-02T10:00:00.000Z'],
          ['lec-rec-c', 'Untitled lecture', null, '2026-04-03T10:00:00.000Z'],
        ])
        const recordings = await tx`SELECT id, lecture_id FROM recordings WHERE user_id = ${carol} ORDER BY id`
        expect(recordings.map((r) => [r.id, r.lecture_id])).toEqual([['rec-a', 'lec-rec-a'], ['rec-b', 'lec-rec-b'], ['rec-c', 'lec-rec-c']])
        const tags = await tx`SELECT label FROM tags WHERE user_id = ${carol}`
        expect(tags.map((t) => t.label)).toEqual(['favourite'])
        const scopes = await tx`SELECT workspace_id, scope_type, scope_value FROM workspace_scopes WHERE user_id = ${carol} ORDER BY scope_type`
        expect(scopes.map((s) => [s.workspace_id, s.scope_type, s.scope_value])).toEqual([
          [ws.id, 'lecture', 'lec-rec-a'],
          [ws.id, 'tag', 'biology'],
        ])
        const [{ is_nullable }] = await tx`
          SELECT is_nullable FROM information_schema.columns WHERE table_name = 'recordings' AND column_name = 'lecture_id'
        `
        expect(is_nullable).toBe('NO')
      })
    })
  })
})
