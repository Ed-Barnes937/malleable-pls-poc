// @vitest-environment node
/**
 * A class changing course takes its future lectures with it; past ones stay
 * (Round 4, `moveFutureClassLectures` in planItems.update). Opt-in like the
 * other db tests: runs only when TEST_DATABASE_URL points at a migrated
 * database, e.g.
 *
 *   TEST_DATABASE_URL=postgres://pls:pls@localhost:5433/malleable_pls_t4 pnpm test class-course-follow.db
 *
 * Fresh random user ids; rows deleted afterwards. No DDL. Dated around the
 * real clock: each class is weekly at 10:00 UTC from two weeks ago, and
 * today's occurrence is never used.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { CLASS_CAPTURE_LEAD_MIN } from '@pls/substrate'
import { lockProbes } from '../test-support/locks'

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL
const DAY_MS = 24 * 60 * 60_000

describe.skipIf(!TEST_DATABASE_URL)('a class changing course (Postgres)', () => {
  let db: typeof import('@pls/db')
  let caller: (userId: string) => ReturnType<typeof import('../router').appRouter.createCaller>
  let locks: ReturnType<typeof lockProbes>
  const alice = `test-alice-${randomUUID().slice(0, 8)}`
  const api = () => caller(alice)

  /** Midnight UTC two weeks before today: week 0 of every class here. */
  const firstWeek = Math.floor(Date.now() / DAY_MS) * DAY_MS - 14 * DAY_MS
  /** The date of a class's occurrence `weeks` weeks after week 0 (2 is today). */
  const week = (weeks: number) => new Date(firstWeek + weeks * 7 * DAY_MS).toISOString().slice(0, 10)

  /** A weekly class of `course`, 10:00-11:00 UTC from week 0. */
  const weeklyClass = async (course: string | null) => (await api().planItems.create({
    kind: 'commitment', title: `Class ${randomUUID().slice(0, 4)}`, subtype: 'class', course,
    starts_at: new Date(firstWeek + 10 * 60 * 60_000).toISOString(),
    ends_at: new Date(firstWeek + 11 * 60 * 60_000).toISOString(),
    recurrence: { freq: 'weekly', timeZone: 'UTC' },
    timeZone: 'UTC',
  })).id
  /** The class's lecture `weeks` weeks after week 0, made now. */
  const lecture = async (classId: string, weeks: number) =>
    (await api().lectures.forClassOccurrence({ planItemId: classId, date: week(weeks), timeZone: 'UTC' })).lecture.id
  const record = async (lectureId: string) => {
    await db.sql`
      INSERT INTO recordings (id, user_id, lecture_id, title, status)
      VALUES (${`rec-${randomUUID()}`}, ${alice}, ${lectureId}, 'Recorded', 'ready')
    `
  }
  const courseOf = async (lectureId: string) =>
    ((await db.sql`SELECT course FROM lectures WHERE id = ${lectureId}`)[0]?.course as string | null | undefined) ?? null
  const board = async (courseTag?: string) =>
    (await api().workspaces.create({ name: `Board ${randomUUID().slice(0, 4)}`, courseTag })).id as string
  const showing = async (lectureId: string, courseTag?: string) => {
    const ws = await board(courseTag)
    await api().workspaces.setBoardScope({ workspaceId: ws, lectureId })
    return ws
  }
  const storedScope = async (workspaceId: string) =>
    (await db.sql`SELECT scope_type, scope_value FROM workspace_scopes WHERE workspace_id = ${workspaceId} ORDER BY scope_type`)
      .map((r) => [r.scope_type, r.scope_value])
  const changeCourse = (classId: string, course: string | null) =>
    api().planItems.update({ id: classId, patch: { course } })

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL
    db = await import('@pls/db')
    locks = lockProbes(db.sql)
    const { appRouter } = await import('../router')
    const { createAiDeps } = await import('../ai/deps')
    const { createServerExecutors } = await import('../workflows/executors')
    const ai = createAiDeps()
    const executors = createServerExecutors(ai)
    caller = (userId) => appRouter.createCaller({ userId, ai, executors })
  })

  afterAll(async () => {
    if (!db) return
    await db.sql`DELETE FROM workspaces WHERE user_id = ${alice}`
    await db.sql`DELETE FROM lectures WHERE user_id = ${alice}`
    await db.sql`DELETE FROM plan_items WHERE user_id = ${alice}`
    await db.sql`DELETE FROM tags WHERE user_id = ${alice}`
    await db.sql.end()
  })

  it('future unrecorded lectures follow the class; past and recorded ones stay', async () => {
    const bio = await weeklyClass('biology')
    const past = await lecture(bio, 1)
    const future = await lecture(bio, 3)
    const recorded = await lecture(bio, 4)
    await record(recorded)
    // Another class's future lecture is not this class's.
    const other = await lecture(await weeklyClass('biology'), 3)

    expect(await changeCourse(bio, 'chemistry')).toMatchObject({ course: 'chemistry' })

    expect(await courseOf(future)).toBe('chemistry')
    expect(await courseOf(past)).toBe('biology')
    expect(await courseOf(recorded)).toBe('biology')
    expect(await courseOf(other)).toBe('biology')
    // And a lecture made after the change is filed under the new course.
    expect(await courseOf(await lecture(bio, 5))).toBe('chemistry')
  })

  it('a lecture the student filed elsewhere by hand stays; from no course, only unfiled lectures move', async () => {
    const bio = await weeklyClass('biology')
    const hand = await lecture(bio, 3)
    const plain = await lecture(bio, 4)
    await api().lectures.update({ id: hand, course: 'chemistry' })
    await changeCourse(bio, 'physics')
    expect(await courseOf(hand)).toBe('chemistry')
    expect(await courseOf(plain)).toBe('physics')

    const guest = await weeklyClass(null)
    const unfiled = await lecture(guest, 3)
    const filed = await lecture(guest, 4)
    await api().lectures.update({ id: filed, course: 'chemistry' })
    await changeCourse(guest, 'biology')
    expect(await courseOf(unfiled)).toBe('biology')
    expect(await courseOf(filed)).toBe('chemistry')
  })

  it('the Record lead-in counts as started: a lecture starting inside it stays, one just outside moves', async () => {
    const MIN = 60_000
    const classAt = async (minutesFromNow: number) => {
      const start = new Date(Date.now() + minutesFromNow * MIN)
      const id = (await api().planItems.create({
        kind: 'commitment', title: `Class ${randomUUID().slice(0, 4)}`, subtype: 'class', course: 'biology',
        starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 60 * MIN).toISOString(),
        recurrence: { freq: 'weekly', timeZone: 'UTC' }, timeZone: 'UTC',
      })).id
      const made = await api().lectures.forClassOccurrence({ planItemId: id, date: start.toISOString().slice(0, 10), timeZone: 'UTC' })
      return { id, lecture: made.lecture.id as string }
    }
    const inside = await classAt(CLASS_CAPTURE_LEAD_MIN - 3)
    const outside = await classAt(CLASS_CAPTURE_LEAD_MIN + 3)
    await changeCourse(inside.id, 'chemistry')
    await changeCourse(outside.id, 'chemistry')
    expect(await courseOf(inside.lecture)).toBe('biology')
    expect(await courseOf(outside.lecture)).toBe('chemistry')
  })

  it('refiles the boards showing a moved lecture; an "All courses" board stays so, a past lecture\'s board stays', async () => {
    const bio = await weeklyClass('biology')
    const future = await lecture(bio, 3)
    const later = await lecture(bio, 4)
    const past = await lecture(bio, 1)
    const courseBoard = await showing(future, 'biology')
    const allCourses = await showing(later)
    const pastBoard = await showing(past, 'biology')

    await changeCourse(bio, 'physics')

    expect(await storedScope(courseBoard)).toEqual([['lecture', future], ['tag', 'physics']])
    expect(await storedScope(allCourses)).toEqual([['lecture', later]])
    expect(await storedScope(pastBoard)).toEqual([['lecture', past], ['tag', 'biology']])
  })

  it('to no course: the future lectures are unfiled, and a course board showing one becomes "All courses"', async () => {
    const bio = await weeklyClass('biology')
    const future = await lecture(bio, 3)
    const ws = await showing(future, 'biology')

    await changeCourse(bio, null)

    expect(await courseOf(future)).toBeNull()
    expect(await storedScope(ws)).toEqual([['lecture', future]])
  })

  it('from no course: the future lectures take the new one', async () => {
    const guest = await weeklyClass(null)
    const future = await lecture(guest, 3)
    await changeCourse(guest, 'biology')
    expect(await courseOf(future)).toBe('biology')
  })

  it('an edit that keeps the course moves nothing, even a lecture refiled on its own', async () => {
    const bio = await weeklyClass('biology')
    const future = await lecture(bio, 3)
    await api().lectures.update({ id: future, course: 'chemistry' })
    await api().planItems.update({ id: bio, patch: { title: 'Renamed', course: 'biology' } })
    expect(await courseOf(future)).toBe('chemistry')
  })

  it('a lecture being opened for an occurrence while the class changes course waits, then takes the new course', async () => {
    const bio = await weeklyClass('biology')
    // The class's course change is under way (its row and course written, not committed).
    const holder = await locks.hold(async (tx) => {
      await tx`UPDATE plan_items SET updated_at = now() WHERE id = ${bio}`
      await tx`DELETE FROM tags WHERE target_type = 'plan_item' AND target_id = ${bio}`
      await tx`INSERT INTO tags (user_id, target_type, target_id, label) VALUES (${alice}, 'plan_item', ${bio}, 'chemistry')`
    })
    let opened
    try {
      const opening = lecture(bio, 3)
      await expect.poll(async () => (await locks.waiting(holder.pid)).on_it).toBe(1)
      await holder.release()
      opened = await opening
    } finally {
      await holder.release()
    }
    expect(await courseOf(opened)).toBe('chemistry')
  })

  it('locks the lectures it moves in id order before any board: a board selecting one meanwhile does not deadlock', async () => {
    const bio = await weeklyClass('biology')
    const made = [await lecture(bio, 3), await lecture(bio, 4)]
    const [first, second] = (await db.sql`SELECT id FROM lectures WHERE id = ANY(${made}) ORDER BY id`).map((r) => r.id as string)
    const ws = await showing(first, 'biology')

    // A scope write elsewhere holds the second lecture (FOR SHARE), so the
    // change waits for it, holding the first lecture and no board row yet.
    const holder = await locks.hold((tx) => tx`SELECT id FROM lectures WHERE id = ${second} FOR SHARE`)
    try {
      const change = changeCourse(bio, 'chemistry')
      await expect.poll(async () => (await locks.waiting(holder.pid)).on_it).toBe(1)

      // The board showing the first lecture moves to the second: it reads
      // the second FOR SHARE and writes its rows, which the change has not
      // touched yet. (Had the change refiled the first lecture's boards
      // before locking the second, the two would deadlock here.)
      const { outcome: moved } = await locks.settledOrBehind(holder.pid, () =>
        api().workspaces.setBoardScope({ workspaceId: ws, lectureId: second }))
      await holder.release()
      await Promise.all([change, moved])
    } finally {
      await holder.release()
    }

    expect(await courseOf(first)).toBe('chemistry')
    expect(await courseOf(second)).toBe('chemistry')
    expect(await storedScope(ws)).toEqual([['lecture', second], ['tag', 'chemistry']])
  })
})
