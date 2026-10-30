import type { Resource } from '@pls/substrate'

export interface LectureGroup {
  lectureId: string
  title: string
  resources: Resource[]
}

export interface ResourceSections {
  /** The selected lecture's resources; null when no lecture is selected. */
  lecture: Resource[] | null
  /** Resources filed under the course itself (or unfiled, on an "All courses" board). */
  course: Resource[]
  /**
   * Resources of other lectures, one group per lecture, latest-added
   * lecture first: "In lectures" without a selected lecture, "Other
   * lectures" with one.
   */
  otherLectures: LectureGroup[]
}

/**
 * Splits a board's resources (already narrowed to its course by the reader)
 * into what the widget shows: the selected lecture's, the course's own, and
 * those of the course's other lectures, grouped by lecture. Nothing in the
 * list is dropped. Order within each part is kept (newest first).
 */
export function groupResources(resources: Resource[], lectureId: string | undefined): ResourceSections {
  const lecture: Resource[] = []
  const course: Resource[] = []
  const groups = new Map<string, LectureGroup>()
  for (const resource of resources) {
    if (!resource.lecture_id) {
      course.push(resource)
    } else if (resource.lecture_id === lectureId) {
      lecture.push(resource)
    } else {
      let group = groups.get(resource.lecture_id)
      if (!group) {
        group = { lectureId: resource.lecture_id, title: resource.lecture_title ?? 'Lecture', resources: [] }
        groups.set(resource.lecture_id, group)
      }
      group.resources.push(resource)
    }
  }
  return { lecture: lectureId ? lecture : null, course, otherLectures: [...groups.values()] }
}

/** "2h ago"-style age of an edit, for a note's row. */
export function editedAgo(at: string | Date, now: number): string {
  const minutes = Math.floor((now - new Date(at).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
