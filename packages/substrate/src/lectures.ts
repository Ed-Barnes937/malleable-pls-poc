/**
 * The name a new lecture gets when nobody gives it one: the course's name and when
 * it started, in the student's zone, e.g. "Biology lecture 30 Oct, 10:04", or
 * "Lecture 30 Oct, 10:04" when it is filed under no course. Easy to rename.
 */
export function defaultLectureTitle(courseName: string | null, at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(at)
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ''
  const when = `${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`
  const name = courseName ? `${courseName} lecture` : 'Lecture'
  return `${name} ${when}`
}

/**
 * What deleting a lecture would remove (`lectures.deletePreview`), for the
 * confirm step. Counts are of what goes; `keptPlanItems` are finished items
 * made from its moments, which stay (with their link to it cleared).
 */
export interface LectureDeletePreview {
  lecture: { id: string; title: string }
  /** Its recordings and their total length; their transcripts go with them. */
  recordings: { count: number; durationMs: number }
  /** Tags, notes (the AI summary too), confidence ratings and links on its recordings and their moments. */
  marks: number
  /** Unfinished plan items made from its moments (a review study block), soonest first. */
  planItems: { id: string; title: string; starts_at: string | null; due_at: string | null }[]
  /** Finished plan items made from its moments: they stay. */
  keptPlanItems: number
  /** Its resources, and how many of them are uploaded files. */
  resources: { count: number; files: number }
  /**
   * Stands for everything listed: `lectures.delete` with it refuses
   * (CONFLICT) once anything has changed since, e.g. a transcript arrived.
   */
  fingerprint: string
}

/**
 * True when deleting the lecture loses nothing but the lecture itself: no
 * recordings, resources or plan items made from it, so no confirm step.
 */
export function isEmptyLectureDeletion(preview: LectureDeletePreview): boolean {
  return preview.recordings.count === 0
    && preview.resources.count === 0
    && preview.planItems.length === 0
    && preview.keptPlanItems === 0
}

/**
 * The text a deletion fingerprint is made from: the ids of everything that
 * would go or change, each list sorted, in a fixed order. The server hashes
 * it; the backend simulator uses it as is.
 */
export function lectureDeletionFingerprintSource(ids: {
  recordings: string[]
  segments: string[]
  marks: string[]
  planItems: string[]
  keptPlanItems: string[]
  resources: string[]
}): string {
  const sorted = (list: string[]) => [...list].sort()
  return JSON.stringify([
    sorted(ids.recordings),
    sorted(ids.segments),
    sorted(ids.marks),
    sorted(ids.planItems),
    sorted(ids.keptPlanItems),
    sorted(ids.resources),
  ])
}
