import type { TxSql } from '@pls/db'
import { ensureCourse } from './courses'

export interface TestRecording {
  id: string
  userId: string
  title: string
  /** The lecture's course, given to the student if they don't have it; none by default. */
  course?: string | null
  status?: string
  audioUrl?: string | null
  createdAt?: Date
}

/**
 * For db tests: a recording in its own new lecture ('lec-' + its id), as
 * an upload makes one. Every recording has a lecture, and the course lives
 * on the lecture. Delete 'lectures' in cleanup (recordings cascade).
 */
export async function insertRecording(tx: TxSql, r: TestRecording): Promise<{ lectureId: string }> {
  const lectureId = `lec-${r.id}`
  const createdAt = r.createdAt ?? new Date()
  if (r.course) await ensureCourse(tx, r.userId, r.course)
  await tx`
    INSERT INTO lectures (id, user_id, title, course, starts_at, created_at)
    VALUES (${lectureId}, ${r.userId}, ${r.title}, ${r.course ?? null}, ${createdAt}, ${createdAt})
  `
  await tx`
    INSERT INTO recordings (id, user_id, lecture_id, title, status, audio_url, created_at)
    VALUES (${r.id}, ${r.userId}, ${lectureId}, ${r.title}, ${r.status ?? 'ready'}, ${r.audioUrl ?? null}, ${createdAt})
  `
  return { lectureId }
}
