import { TRPCError } from '@trpc/server'
import type { TxSql } from '@pls/db'
import {
  captureClassRange,
  classForCapture,
  classLectureTitle,
  isClassBlock,
  occurrenceDate,
  occurrenceOn,
} from '@pls/substrate'
import { fetchOne, listPlanItems } from '../plan-items/store'

// TODO(02/03 open question 1): what happens to a class's lectures when the
// class's course changes later (recommended: unrecorded future lectures
// follow the class, past ones stay). Until it is decided, a lecture keeps the
// course it was made with; nothing here or in planItems.update moves it.

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
 * KEY SHARE until the transaction ends, as foreign keys skip row-level
 * security), and BAD_REQUEST when it isn't a class block or has no
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
  const [owned] = await tx`SELECT id FROM plan_items WHERE id = ${planItemId} AND user_id = ${userId} FOR KEY SHARE`
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
