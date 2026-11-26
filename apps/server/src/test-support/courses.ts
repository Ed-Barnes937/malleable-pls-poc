import { STARTER_COURSES } from '@pls/substrate'
import type { TxSql } from '@pls/db'

/**
 * For db tests: gives each student Biology, Chemistry and Physics (ids
 * 'biology', 'chemistry', 'physics'), as the seeds do. A new student has no
 * courses, and lectures, resources and plan items can only be filed under
 * one of the student's own. Delete 'courses' last in cleanup, after
 * everything filed under them.
 */
/**
 * For db tests: makes sure the student has course `id`, a starter course
 * when it is one's id, else a course named after it (as the migration names
 * a stray value).
 */
export async function ensureCourse(sql: Pick<TxSql, 'unsafe'>, userId: string, id: string): Promise<void> {
  const starter = STARTER_COURSES.find((c) => c.id === id)
  await sql.unsafe(
    'INSERT INTO courses (user_id, id, name, color) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
    [userId, id, starter?.name ?? id, starter?.color ?? 'slate'],
  )
}

export async function insertStarterCourses(sql: Pick<TxSql, 'unsafe'>, ...userIds: string[]): Promise<void> {
  for (const userId of userIds) {
    for (const c of STARTER_COURSES) {
      await sql.unsafe(
        'INSERT INTO courses (user_id, id, name, color) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
        [userId, c.id, c.name, c.color],
      )
    }
  }
}
