// @vitest-environment node
/**
 * Courses against a real Postgres, opt-in like the other db tests: runs only
 * when TEST_DATABASE_URL points at a migrated database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test courses.db
 *
 * No DDL: random users, their rows deleted afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { insertStarterCourses } from '../test-support/courses'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL

describe.skipIf(!TEST_DATABASE_URL)('courses (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  const users: string[] = []
  const badRequest = expect.objectContaining({ code: 'BAD_REQUEST', message: 'Unknown course' })
  const conflict = (message: string | RegExp) => expect.objectContaining({ code: 'CONFLICT', message: expect.stringMatching(message) })
  const notFound = expect.objectContaining({ code: 'NOT_FOUND' })

  /** A fresh student: none of their own courses, unless `starters`. */
  async function student({ starters = false } = {}) {
    const user = `test-courses-${randomUUID().slice(0, 8)}`
    users.push(user)
    if (starters) await insertStarterCourses(db.sql, user)
    return { user, api: caller(user) }
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
  })

  afterAll(async () => {
    if (!db) return
    for (const table of ['job_runs', 'workflow_jobs', 'workflows', 'user_provisioning', 'plan_item_trash', 'plan_items', 'resources', 'workspace_scopes', 'workspace_panels', 'workspaces', 'lectures', 'courses']) {
      await db.sql.unsafe(`DELETE FROM ${table} WHERE user_id = ANY($1)`, [users])
    }
    await db.sql.end()
  })

  it('a new student has no courses', async () => {
    const { api } = await student()
    expect(await api.courses.list()).toEqual([])
  })

  it('creates courses trimmed, each in the colour the active ones use least', async () => {
    const { api } = await student()
    const made = []
    for (const name of ['  History ', 'Maths', 'Art', 'Music', 'Drama', 'Latin', 'Greek', 'French', 'German']) {
      made.push(await api.courses.create({ name }))
    }
    expect(made.map((c) => [c.name, c.color])).toEqual([
      ['History', 'green'], ['Maths', 'blue'], ['Art', 'purple'], ['Music', 'amber'], ['Drama', 'rose'],
      ['Latin', 'teal'], ['Greek', 'orange'], ['French', 'slate'], ['German', 'green'],
    ])
    // Ids are opaque uuids, never the name.
    expect(made[0].id).toMatch(/^[0-9a-f-]{36}$/)
    // An archived course's colour is free again; a given colour is kept.
    await api.courses.update({ id: made[1].id, archived: true })
    expect((await api.courses.create({ name: 'Spanish' })).color).toBe('blue')
    expect((await api.courses.create({ name: 'Welsh', color: 'rose' })).color).toBe('rose')
    // Listed by name, archived ones included.
    const listed = await api.courses.list()
    expect(listed.map((c) => c.name)).toEqual(['Art', 'Drama', 'French', 'German', 'Greek', 'History', 'Latin', 'Maths', 'Music', 'Spanish', 'Welsh'])
    expect(listed.find((c) => c.name === 'Maths')!.archived_at).toEqual(expect.any(String))
  })

  it('refuses a name the student already has, whatever the case, naming an archived match', async () => {
    const { api } = await student({ starters: true })
    await expect(api.courses.create({ name: ' biology ' })).rejects.toEqual(conflict('You already have a course called Biology'))
    await api.courses.update({ id: 'physics', archived: true })
    await expect(api.courses.create({ name: 'PHYSICS' })).rejects.toEqual(conflict('You have an archived course called Physics'))
    await expect(api.courses.update({ id: 'chemistry', name: 'Biology' })).rejects.toEqual(conflict('called Biology'))
    await expect(api.courses.create({ name: '   ' })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    await expect(api.courses.create({ name: 'x'.repeat(61) })).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    // Another student may have the same name.
    const { api: other } = await student({ starters: true })
    expect((await other.courses.create({ name: 'History' })).name).toBe('History')
    expect((await api.courses.create({ name: 'History' })).name).toBe('History')
  })

  it("keeps students' courses apart (RLS), and refuses another student's course id everywhere", async () => {
    const { user: alice, api } = await student({ starters: true })
    const { user: bob, api: bobApi } = await student({ starters: true })
    const bobs = await bobApi.courses.create({ name: 'Bob only' })
    expect((await api.courses.list()).map((c) => c.id)).toEqual(['biology', 'chemistry', 'physics'])
    // As the app's role (the docker superuser bypasses RLS) with Alice's session setting.
    const asAlice = (statement: (tx: import('@pls/db').TxSql) => Promise<unknown>) => db.withUser(alice, async (tx) => {
      await tx.unsafe('SET LOCAL ROLE pls_app')
      return statement(tx)
    })
    expect(await asAlice((tx) => tx`SELECT id FROM courses WHERE user_id = ${bob}`)).toEqual([])
    expect(await asAlice((tx) => tx`SELECT id FROM courses ORDER BY id`)).toEqual([{ id: 'biology' }, { id: 'chemistry' }, { id: 'physics' }])
    await expect(asAlice((tx) => tx`INSERT INTO courses (user_id, name, color) VALUES (${bob}, 'Planted', 'green')`))
      .rejects.toMatchObject({ code: '42501' })
    await expect(api.courses.update({ id: bobs.id, name: 'Mine now' })).rejects.toEqual(notFound)
    await expect(api.courses.delete(bobs.id)).rejects.toEqual(notFound)
    expect((await bobApi.courses.list()).find((c) => c.id === bobs.id)!.name).toBe('Bob only')

    // Every writer checks the course is the student's own.
    const board = (await api.workspaces.create({ name: 'Board' })).id as string
    await expect(api.workspaces.create({ name: 'B', courseTag: bobs.id })).rejects.toEqual(badRequest)
    await expect(api.workspaces.setBoardScope({ workspaceId: board, courseTag: bobs.id })).rejects.toEqual(badRequest)
    await expect(api.lectures.create({ course: bobs.id })).rejects.toEqual(badRequest)
    const lecture = await api.lectures.create({ course: 'biology' })
    await expect(api.lectures.update({ id: lecture.id, course: bobs.id })).rejects.toEqual(badRequest)
    await expect(api.resources.createLink({ url: 'https://a.test', courseTag: bobs.id })).rejects.toEqual(badRequest)
    await expect(api.resources.createNote({ title: 'N', body_md: 'x', courseTag: bobs.id })).rejects.toEqual(badRequest)
    await expect(api.planItems.create({ kind: 'task', title: 'T', course: bobs.id })).rejects.toEqual(badRequest)

    // The foreign key refuses it even with an id string the student also has:
    // a course is (student, id).
    const carol = `test-courses-${randomUUID().slice(0, 8)}`
    users.push(carol)
    await expect(db.withUser(carol, (tx) => tx`INSERT INTO lectures (user_id, title, course) VALUES (${carol}, 'X', 'biology')`))
      .rejects.toMatchObject({ code: '23503' })
    await expect(db.withUser(alice, (tx) => tx`INSERT INTO plan_items (user_id, kind, title, course) VALUES (${alice}, 'task', 'X', ${bobs.id})`))
      .rejects.toMatchObject({ code: '23503' })
  })

  it('renaming or recolouring changes the one course row and nothing filed under it', async () => {
    const { user, api } = await student({ starters: true })
    const lecture = await api.lectures.create({ course: 'biology', title: 'Cells' })
    const resource = await api.resources.createLink({ url: 'https://a.test', courseTag: 'biology' })
    const todo = await api.planItems.create({ kind: 'task', title: 'Read', course: 'biology' })
    const board = (await api.workspaces.create({ name: 'Board', courseTag: 'biology' })).id as string
    const filed = () => db.withUser(user, async (tx) => ({
      lectures: await tx`SELECT * FROM lectures WHERE user_id = ${user}`,
      resources: await tx`SELECT * FROM resources WHERE user_id = ${user}`,
      planItems: await tx`SELECT * FROM plan_items WHERE user_id = ${user}`,
      scopes: await tx`SELECT * FROM workspace_scopes WHERE user_id = ${user}`,
      courses: await tx`SELECT id, name, color, updated_at FROM courses WHERE user_id = ${user} AND id <> 'biology' ORDER BY id`,
    }))
    const before = await filed()

    expect(await api.courses.update({ id: 'biology', name: 'Cell Biology', color: 'teal' }))
      .toEqual({ id: 'biology', name: 'Cell Biology', color: 'teal', archived_at: null })
    expect(await filed()).toEqual(before)
    expect((await api.lectures.byId(lecture.id))!.course).toBe('biology')
    expect((await api.resources.get(resource.id))!.course).toBe('biology')
    expect((await api.planItems.byId(todo.id))!.course).toBe('biology')
    expect(await api.workspaces.scopes(board)).toEqual([expect.objectContaining({ scope_type: 'tag', scope_value: 'biology' })])
    // A lecture named from its course takes the course's name now.
    expect((await api.lectures.create({ course: 'biology' })).title).toMatch(/^Cell Biology lecture /)
  })

  it('archives and restores: hidden from pickers, never refused, still filtered and counted', async () => {
    const { api } = await student({ starters: true })
    const lecture = await api.lectures.create({ course: 'chemistry' })
    const archived = await api.courses.update({ id: 'physics', archived: true })
    expect(archived.archived_at).toEqual(expect.any(String))
    // Archiving again keeps the time it was archived.
    expect((await api.courses.update({ id: 'physics', archived: true })).archived_at).toBe(archived.archived_at)
    expect((await api.courses.list()).find((c) => c.id === 'physics')!.archived_at).toBe(archived.archived_at)

    expect((await api.lectures.update({ id: lecture.id, course: 'physics' })).course).toBe('physics')
    expect((await api.lectures.list({ courseTag: 'physics' })).map((l) => l.id)).toEqual([lecture.id])
    const todo = await api.planItems.create({ kind: 'task', title: 'Waves', course: 'physics' })
    expect((await api.planItems.list({ courseTag: 'physics' })).map((p) => p.id)).toEqual([todo.id])
    const board = (await api.workspaces.create({ name: 'Board' })).id as string
    expect(await api.workspaces.setBoardScope({ workspaceId: board, courseTag: 'physics' })).toEqual({ courseTag: 'physics', lectureId: null })

    expect((await api.courses.update({ id: 'physics', archived: false })).archived_at).toBeNull()
    expect((await api.courses.list()).every((c) => c.archived_at === null)).toBe(true)
  })

  it('deletes only a course nothing files under; boards scoped to it become All courses', async () => {
    const { user, api } = await student({ starters: true })
    const lecture = await api.lectures.create({ course: 'biology' })
    await api.lectures.create({ course: 'biology' })
    await api.resources.createLink({ url: 'https://a.test', courseTag: 'chemistry' })
    const todo = await api.planItems.create({ kind: 'task', title: 'Read', course: 'physics' })
    await expect(api.courses.delete('biology')).rejects.toEqual(conflict('Biology is still used by 2 lectures: archive it instead'))
    await expect(api.courses.delete('chemistry')).rejects.toEqual(conflict('Chemistry is still used by 1 resource'))
    await expect(api.courses.delete('physics')).rejects.toEqual(conflict('Physics is still used by 1 plan item'))
    expect((await api.courses.list()).length).toBe(3)

    // Once nothing does, it goes, and the boards on it show every course.
    await api.planItems.delete(todo.id)
    const board = (await api.workspaces.create({ name: 'Physics board', courseTag: 'physics' })).id as string
    expect(await api.courses.delete('physics')).toEqual({ id: 'physics' })
    expect((await api.courses.list()).map((c) => c.id)).toEqual(['biology', 'chemistry'])
    expect(await api.workspaces.scopes(board)).toEqual([])
    await expect(api.courses.delete('physics')).rejects.toEqual(notFound)

    // Unknown now, everywhere.
    await expect(api.lectures.update({ id: lecture.id, course: 'physics' })).rejects.toEqual(badRequest)
    await expect(api.workspaces.setBoardScope({ workspaceId: board, courseTag: 'physics' })).rejects.toEqual(badRequest)
    expect(await db.withUser(user, (tx) => tx`SELECT 1 FROM workspace_scopes WHERE user_id = ${user} AND scope_value = 'physics'`)).toEqual([])
  })

  it('a delete racing a board being filed under the course never leaves the board on a course that is gone', async () => {
    const { user, api } = await student({ starters: true })
    for (let i = 0; i < 5; i++) {
      const course = await api.courses.create({ name: `Race ${i}` })
      const board = (await api.workspaces.create({ name: `Board ${i}` })).id as string
      const [deleted, filed] = await Promise.allSettled([
        api.courses.delete(course.id),
        api.workspaces.setBoardScope({ workspaceId: board, courseTag: course.id }),
      ])
      const exists = (await db.withUser(user, (tx) => tx`SELECT 1 FROM courses WHERE user_id = ${user} AND id = ${course.id}`)).length > 0
      const scopes = await api.workspaces.scopes(board)
      expect(deleted.status === 'fulfilled').toBe(!exists)
      if (exists) {
        // Filed first: the delete cleared nothing it shouldn't, or never ran.
        expect(scopes.map((s) => s.scope_value)).toEqual(filed.status === 'fulfilled' ? [course.id] : [])
      } else {
        // Deleted: the board is on All courses whichever ran first.
        expect(scopes).toEqual([])
      }
    }
  })

  it('Undo of a deleted plan item puts it back unfiled when its course has gone since', async () => {
    const { api } = await student({ starters: true })
    const course = await api.courses.create({ name: 'Typo' })
    const kept = await api.planItems.create({ kind: 'task', title: 'Kept course', course: 'biology' })
    const todo = await api.planItems.create({ kind: 'task', title: 'Lost course', course: course.id })
    await api.planItems.delete(todo.id)
    await api.planItems.delete(kept.id)
    await api.courses.delete(course.id)
    expect(await api.planItems.restore(todo.id)).toMatchObject({ id: todo.id, title: 'Lost course', course: null })
    expect(await api.planItems.restore(kept.id)).toMatchObject({ id: kept.id, course: 'biology' })
  })
})
