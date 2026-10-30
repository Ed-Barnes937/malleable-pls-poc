// @vitest-environment node
/**
 * Resources against a real Postgres, opt-in like the other db tests: runs
 * only when TEST_DATABASE_URL points at a migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test resources.db
 *
 * No DDL: random users, their rows deleted afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { insertRecording } from '../test-support/recordings'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('resources (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const bob = `test-bob-${randomUUID().slice(0, 8)}`
  let bioLecture: string
  let chemLecture: string
  let bobLecture: string

  const notFound = expect.objectContaining({ code: 'NOT_FOUND' })
  const badRequest = expect.objectContaining({ code: 'BAD_REQUEST' })
  const conflict = expect.objectContaining({ code: 'CONFLICT' })
  const api = () => caller(alice)
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title).sort()

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
      bioLecture = (await insertRecording(tx, { id: `rec-bio-${alice}`, userId: alice, title: 'Cells', course: 'biology' })).lectureId
      chemLecture = (await insertRecording(tx, { id: `rec-chem-${alice}`, userId: alice, title: 'Alkenes', course: 'chemistry' })).lectureId
    })
    await db.withUser(bob, async (tx) => {
      bobLecture = (await insertRecording(tx, { id: `rec-${bob}`, userId: bob, title: 'Bob', course: 'biology' })).lectureId
    })
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'resources', 'workspace_scopes', 'workspace_panels', 'workspaces', 'lectures']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [[alice, bob]])
    }
    await db.sql.end()
  })

  it('creates links with the provider from the URL and a title from what it is', async () => {
    const sheet = await api().resources.createLink({ url: ' https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=0 ', courseTag: 'biology' })
    expect(sheet).toMatchObject({ kind: 'link', provider: 'google_sheet', title: 'Google Sheet', course: 'biology', lecture_id: null, excerpt: null })
    expect(sheet.url).toBe('https://docs.google.com/spreadsheets/d/1XyZ/edit#gid=0')
    const web = await api().resources.createLink({ url: 'https://www.bbc.co.uk/bitesize', title: 'Bitesize' })
    expect(web).toMatchObject({ provider: 'web', title: 'Bitesize', course: null, lecture_id: null })
    const untitledWeb = await api().resources.createLink({ url: 'https://www.bbc.co.uk/news' })
    expect(untitledWeb.title).toBe('bbc.co.uk')
  })

  it('refuses links that are not http(s)', async () => {
    for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://x.test/a', 'not a url']) {
      await expect(api().resources.createLink({ url })).rejects.toEqual(badRequest)
    }
  })

  it('creates notes, lists an excerpt and gets the full body', async () => {
    const note = await api().resources.createNote({ lectureId: bioLecture })
    expect(note).toMatchObject({ kind: 'note', title: 'Untitled note', body_md: '', lecture_id: bioLecture, course: null, lecture_course: 'biology', lecture_title: 'Cells' })
    const body = `## Krebs\n\nThe **citric acid** cycle.\n\n${'x'.repeat(5000)}`
    const saved = await api().resources.update({ id: note.id, patch: { body_md: body, title: 'Krebs' }, expectedUpdatedAt: note.updated_at })
    expect(saved.body_md).toBe(body)
    const listed = (await api().resources.list({ lectureId: bioLecture })).find((r) => r.id === note.id)!
    expect(listed).not.toHaveProperty('body_md')
    expect(listed.excerpt).toMatch(/^Krebs The citric acid cycle\. x+…$/)
    expect((await api().resources.get(note.id))?.body_md).toBe(body)
  })

  it('files a resource under a lecture or a course, never both, and validates both', async () => {
    await expect(api().resources.createNote({ lectureId: bioLecture, courseTag: 'biology' })).rejects.toEqual(badRequest)
    await expect(api().resources.createNote({ courseTag: 'history' })).rejects.toEqual(badRequest)
    // Another student's lecture, or one that doesn't exist (I3).
    await expect(api().resources.createNote({ lectureId: bobLecture })).rejects.toEqual(notFound)
    await expect(api().resources.createLink({ url: 'https://x.test', lectureId: 'lec-missing' })).rejects.toEqual(notFound)

    // The table refuses both too.
    await expect(db.withUser(alice, (tx) => tx`
      INSERT INTO resources (user_id, kind, title, body_md, lecture_id, course)
      VALUES (${alice}, 'note', 'Both', '', ${bioLecture}, 'biology')
    `)).rejects.toThrow(/chk_resources_attach/)
    await expect(db.withUser(alice, (tx) => tx`
      INSERT INTO resources (user_id, kind, title) VALUES (${alice}, 'link', 'No url')
    `)).rejects.toThrow(/chk_resources_link/)
  })

  it('moves a resource between lecture, course and unfiled; setting one clears the other', async () => {
    const note = await api().resources.createNote({ title: 'Movable', courseTag: 'biology' })
    const toLecture = await api().resources.update({ id: note.id, patch: { lectureId: chemLecture } })
    expect(toLecture).toMatchObject({ lecture_id: chemLecture, course: null, lecture_course: 'chemistry' })
    const toCourse = await api().resources.update({ id: note.id, patch: { courseTag: 'physics' } })
    expect(toCourse).toMatchObject({ lecture_id: null, course: 'physics' })
    const unfiled = await api().resources.update({ id: note.id, patch: { courseTag: null, lectureId: null } })
    expect(unfiled).toMatchObject({ lecture_id: null, course: null })
    await expect(api().resources.update({ id: note.id, patch: { lectureId: bobLecture } })).rejects.toEqual(notFound)
    await expect(api().resources.update({ id: note.id, patch: { lectureId: bioLecture, courseTag: 'biology' } })).rejects.toEqual(badRequest)
    await expect(api().resources.update({ id: note.id, patch: { courseTag: 'history' } })).rejects.toEqual(badRequest)
  })

  it('edits only the fields a kind has', async () => {
    const link = await api().resources.createLink({ url: 'https://example.com/a' })
    const note = await api().resources.createNote({})
    await expect(api().resources.update({ id: link.id, patch: { body_md: 'x' } })).rejects.toEqual(badRequest)
    await expect(api().resources.update({ id: note.id, patch: { url: 'https://example.com' } })).rejects.toEqual(badRequest)
    await expect(api().resources.update({ id: link.id, patch: { url: 'javascript:alert(1)' } })).rejects.toEqual(badRequest)
    const moved = await api().resources.update({ id: link.id, patch: { url: 'https://docs.google.com/presentation/d/1P/edit' } })
    expect(moved).toMatchObject({ provider: 'google_slides', url: 'https://docs.google.com/presentation/d/1P/edit' })
  })

  it('filters by course through its own course or its lecture, and follows a lecture that moves course', async () => {
    const user = `test-carol-${randomUUID().slice(0, 8)}`
    let lecture = ''
    await db.withUser(user, async (tx) => {
      lecture = (await insertRecording(tx, { id: `rec-${user}`, userId: user, title: 'Enzymes', course: 'biology' })).lectureId
    })
    try {
      const carol = caller(user)
      await carol.resources.createLink({ url: 'https://a.test', title: 'Course link', courseTag: 'biology' })
      await carol.resources.createNote({ title: 'Lecture note', lectureId: lecture })
      await carol.resources.createNote({ title: 'Chem note', courseTag: 'chemistry' })
      await carol.resources.createNote({ title: 'Unfiled note' })

      expect(titles(await carol.resources.list({ courseTag: 'biology' }))).toEqual(['Course link', 'Lecture note'])
      expect(titles(await carol.resources.list({ courseTag: 'chemistry' }))).toEqual(['Chem note'])
      expect(titles(await carol.resources.list({ lectureId: lecture }))).toEqual(['Lecture note'])
      expect(titles(await carol.resources.list({ courseTag: 'biology', lectureId: lecture }))).toEqual(['Lecture note'])
      expect(titles(await carol.resources.list())).toEqual(['Chem note', 'Course link', 'Lecture note', 'Unfiled note'])

      // The lecture moves to Chemistry: its note goes with it.
      await carol.lectures.update({ id: lecture, course: 'chemistry' })
      expect(titles(await carol.resources.list({ courseTag: 'biology' }))).toEqual(['Course link'])
      expect(titles(await carol.resources.list({ courseTag: 'chemistry' }))).toEqual(['Chem note', 'Lecture note'])
    } finally {
      await db.sql.unsafe('DELETE FROM resources WHERE user_id = $1', [user])
      await db.sql.unsafe('DELETE FROM lectures WHERE user_id = $1', [user])
    }
  })

  it("deleting a lecture deletes its resources, and only its", async () => {
    let lecture = ''
    await db.withUser(alice, async (tx) => {
      lecture = (await insertRecording(tx, { id: `rec-gone-${alice}`, userId: alice, title: 'Gone', course: 'biology' })).lectureId
    })
    const onLecture = await api().resources.createNote({ title: 'On the lecture', lectureId: lecture })
    const onCourse = await api().resources.createNote({ title: 'On the course', courseTag: 'biology' })
    await db.withUser(alice, (tx) => tx`DELETE FROM lectures WHERE id = ${lecture}`)
    expect(await api().resources.get(onLecture.id)).toBeNull()
    expect(await api().resources.get(onCourse.id)).not.toBeNull()
  })

  it('refuses a stale save with CONFLICT and keeps the newer one', async () => {
    const note = await api().resources.createNote({ title: 'Shared' })
    // Device A saves on top of what it read.
    const a = await api().resources.update({ id: note.id, patch: { body_md: 'from A' }, expectedUpdatedAt: note.updated_at })
    // Device B still has the original: refused, nothing written.
    await expect(api().resources.update({ id: note.id, patch: { body_md: 'from B' }, expectedUpdatedAt: note.updated_at })).rejects.toEqual(conflict)
    expect((await api().resources.get(note.id))?.body_md).toBe('from A')
    // B as an ISO string of A's time saves (the client may hold either).
    const b = await api().resources.update({ id: note.id, patch: { body_md: 'from B' }, expectedUpdatedAt: new Date(a.updated_at).toISOString() })
    expect(b.body_md).toBe('from B')
    expect(new Date(b.updated_at).getTime()).toBeGreaterThan(new Date(a.updated_at).getTime())
    // "Keep mine": a save without the check always lands.
    expect((await api().resources.update({ id: note.id, patch: { body_md: 'mine' } })).body_md).toBe('mine')
  })

  it("reports another student's resource as not found everywhere", async () => {
    const mine = await api().resources.createNote({ title: 'Alice only', courseTag: 'biology' })
    const bobApi = caller(bob)
    expect(await bobApi.resources.get(mine.id)).toBeNull()
    expect((await bobApi.resources.list()).map((r) => r.id)).not.toContain(mine.id)
    await expect(bobApi.resources.update({ id: mine.id, patch: { title: 'hijack' } })).rejects.toEqual(notFound)
    await expect(bobApi.resources.delete(mine.id)).rejects.toEqual(notFound)
    expect((await api().resources.get(mine.id))?.title).toBe('Alice only')
  })

  it('isolates users through RLS as the non-owner app role', async () => {
    const mine = await api().resources.createNote({ title: 'Private' })
    const asApp = (userId: string, query: string, params: unknown[] = []) =>
      db.sql.begin(async (tx) => {
        await tx.unsafe('SET LOCAL ROLE pls_app')
        await tx`SELECT set_config('app.current_user_id', ${userId}, true)`
        return tx.unsafe(query, params as never[])
      })
    expect(await asApp(bob, 'SELECT id FROM resources WHERE id = $1', [mine.id])).toHaveLength(0)
    expect(await asApp(alice, 'SELECT id FROM resources WHERE id = $1', [mine.id])).toHaveLength(1)
    expect(await asApp(bob, `UPDATE resources SET title = 'hijack' WHERE id = $1 RETURNING id`, [mine.id])).toHaveLength(0)
    expect(await asApp(bob, 'DELETE FROM resources WHERE id = $1 RETURNING id', [mine.id])).toHaveLength(0)
    await expect(asApp(bob, `INSERT INTO resources (user_id, kind, title, body_md) VALUES ($1, 'note', 'spoof', '')`, [alice]))
      .rejects.toThrow(/row-level security/)
  })

  it('deletes', async () => {
    const note = await api().resources.createNote({ title: 'Bye' })
    expect(await api().resources.delete(note.id)).toEqual({ id: note.id })
    expect(await api().resources.get(note.id)).toBeNull()
    await expect(api().resources.delete(note.id)).rejects.toEqual(notFound)
  })

  it("checks the board a resource is added from, and dispatches resource:added there", async () => {
    await expect(api().resources.createNote({ workspaceId: 'ws-missing' })).rejects.toEqual(notFound)
    const bobBoard = (await caller(bob).workspaces.create({ name: 'Bob board' })).id as string
    await expect(api().resources.createLink({ url: 'https://x.test', workspaceId: bobBoard })).rejects.toEqual(notFound)

    const board = (await api().workspaces.create({ name: 'Resources board' })).id as string
    const [workflow] = await db.withUser(alice, (tx) => tx`
      INSERT INTO workflows (user_id, source_lens, trigger_event)
      VALUES (${alice}, 'resources', 'resource:added')
      RETURNING id
    `)
    await db.withUser(alice, (tx) => tx`
      INSERT INTO workflow_jobs (user_id, workflow_id, job_type) VALUES (${alice}, ${workflow.id}, 'test:noop')
    `)
    const added = await api().resources.createNote({ title: 'Triggers', courseTag: 'biology', workspaceId: board })
    const runs = await db.withUser(alice, (tx) => tx`SELECT input FROM job_runs WHERE workflow_id = ${workflow.id}`)
    expect(runs).toHaveLength(1)
    expect(runs[0].input).toMatchObject({ resourceId: added.id, kind: 'note', course: 'biology' })
  })
})
