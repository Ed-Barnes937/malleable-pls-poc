import { TRPCError } from '@trpc/server'
import type { TxSql } from '@pls/db'
import {
  CLASS_CAPTURE_LEAD_MIN,
  captureClassRange,
  classForCapture,
  classLectureTitle,
  isClassBlock,
  occurrenceDate,
  occurrenceOn,
} from '@pls/substrate'
import { fetchOne, listPlanItems } from '../plan-items/store'
import { moveLecturesToCourse } from './_board-scope'

/** A class occurrence's lecture, and whether this call made it. */
export interface ClassLecture {
  id: string
  created: boolean
}

/** Insert-then-read rounds before `findOrCreateClassLecture` gives up (each needs a concurrent delete to fail). */
const FIND_OR_CREATE_ROUNDS = 3

/**
 * The lecture of a class occurrence, made if it has none yet: one per
 * student, plan item and local date (`uq_lectures_class_occurrence`), so any
 * number of concurrent calls land on the same row.
 *
 * Throws NOT_FOUND unless the plan item is the student's own (held with FOR
 * SHARE until the transaction ends, as foreign keys skip row-level security,
 * and so a change to the class under way, such as a new course that takes
 * its future lectures with it, is waited for and its course read as
 * committed), and BAD_REQUEST when it isn't a class block or has no
 * occurrence on `date` (read as `occurrenceDate` does, else in `timeZone`).
 *
 * A new lecture is filed under the class's course, starts when the
 * occurrence does, and is named from the class ("Biology lecture · Tue 28
 * Oct"). An existing one is returned as it is (it may since have been
 * renamed or re-filed).
 */
export async function findOrCreateClassLecture(
  tx: TxSql,
  userId: string,
  planItemId: string,
  date: string,
  timeZone: string,
): Promise<ClassLecture> {
  const [owned] = await tx`SELECT id FROM plan_items WHERE id = ${planItemId} AND user_id = ${userId} FOR SHARE`
  if (!owned) throw new TRPCError({ code: 'NOT_FOUND', message: 'Class not found' })
  const item = await fetchOne(tx, userId, planItemId)
  if (!isClassBlock(item)) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not a class' })
  const occurrence = occurrenceOn(item, date, timeZone)
  if (!occurrence) throw new TRPCError({ code: 'BAD_REQUEST', message: 'The class is not on that date' })

  // Insert-or-nothing then read: under READ COMMITTED a concurrent insert of
  // the same occurrence makes this one wait, then do nothing, and the read
  // that follows sees the committed row. Each statement reads afresh, so if
  // that row is deleted between the two (the student deleted the lecture
  // elsewhere), the next round makes it again.
  for (let round = 0; round < FIND_OR_CREATE_ROUNDS; round++) {
    const [inserted] = await tx`
      INSERT INTO lectures (user_id, title, course, starts_at, class_item_id, class_date)
      VALUES (${userId}, ${classLectureTitle(item.title, date)}, ${item.course}, ${occurrence.starts_at}, ${planItemId}, ${date})
      ON CONFLICT (user_id, class_item_id, class_date) WHERE class_item_id IS NOT NULL DO NOTHING
      RETURNING id
    `
    if (inserted) return { id: inserted.id as string, created: true }
    const [existing] = await tx`
      SELECT id FROM lectures WHERE user_id = ${userId} AND class_item_id = ${planItemId} AND class_date = ${date}
    `
    if (existing) return { id: existing.id as string, created: false }
  }
  // Made and deleted under us every round: let the caller try again.
  throw new TRPCError({ code: 'CONFLICT', message: 'That class lecture keeps changing; please try again' })
}


/**
 * The lecture a capture starting at `at` in `course` joins when a class of
 * that course is on (see `classForCapture`, which owns the silent-match
 * rule), or null when none is.
 */
export async function classLectureForCapture(
  tx: TxSql,
  userId: string,
  capture: { course: string | null; at: Date },
  timeZone: string,
): Promise<ClassLecture | null> {
  const at = capture.at.getTime()
  const rows = await listPlanItems(tx, userId, {
    kinds: ['commitment'],
    statuses: ['open'],
    ...(capture.course ? { courseTag: capture.course } : {}),
    ...captureClassRange(at),
  })
  const occurrence = classForCapture(rows, { course: capture.course, at })
  if (!occurrence) return null
  return findOrCreateClassLecture(tx, userId, occurrence.id, occurrenceDate(occurrence, timeZone)!, timeZone)
}

/**
 * A class that changes course takes its future lectures with it; past ones
 * stay (Round 4): every lecture made for one of its occurrences that is
 * still filed under its old course `from` (null: no course), starts after
 * the Record lead-in (`CLASS_CAPTURE_LEAD_MIN` before the start counts as
 * started) and has no recording yet moves to `course` (null: no course), as
 * `lectures.update` changing its course would, boards and all
 * (`moveLecturesToCourse`). A lecture whose class is on now, or has been,
 * keeps its course, as does a recorded one, and one the student filed
 * elsewhere by hand. The caller is changing the class's course in this
 * transaction (it holds the class row). Returns the ids it moved.
 */
export async function moveFutureClassLectures(
  tx: TxSql,
  userId: string,
  planItemId: string,
  from: string | null,
  course: string | null,
): Promise<string[]> {
  const future = await tx`
    SELECT l.id FROM lectures l
    WHERE l.user_id = ${userId} AND l.class_item_id = ${planItemId}
      AND l.course IS NOT DISTINCT FROM ${from}::text
      AND l.starts_at > now() + make_interval(mins => ${CLASS_CAPTURE_LEAD_MIN}::int)
      AND NOT EXISTS (SELECT 1 FROM recordings r WHERE r.lecture_id = l.id AND r.user_id = ${userId})
  `
  return moveLecturesToCourse(tx, userId, future.map((r) => r.id as string), course)
}
