import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Course } from '@pls/substrate'
import { courseTone, type CourseTone } from './constants'

/**
 * The student's courses for display: one lookup from a course id (what
 * lectures, resources, plan items and board scopes hold) to its name and
 * colours. The app provides the list (`CoursesProvider`, fed by
 * `courses.list`); widgets and the shell only look courses up, so a rename
 * or recolour shows everywhere on the next fetch.
 *
 * An id is opaque: never shown. A course not (yet) known looks up as null,
 * and callers show no course name and the neutral tone rather than the id.
 */
export interface CourseInfo {
  id: string
  name: string
  tone: CourseTone
  /** Archived: hidden from pickers, still shown on what it files. */
  archived: boolean
}

interface CoursesValue {
  courses: readonly Course[]
  byId: ReadonlyMap<string, CourseInfo>
}

const EMPTY: CoursesValue = { courses: [], byId: new Map() }
const CoursesCtx = createContext<CoursesValue>(EMPTY)

export function courseInfo(course: Course): CourseInfo {
  return { id: course.id, name: course.name, tone: courseTone(course.color), archived: course.archived_at !== null }
}

/** Provides the student's courses (archived ones included), as `courses.list` returns them. */
export function CoursesProvider({ courses, children }: { courses: readonly Course[] | null | undefined; children: ReactNode }) {
  const value = useMemo<CoursesValue>(() => {
    if (!courses) return EMPTY
    return { courses, byId: new Map(courses.map((c) => [c.id, courseInfo(c)])) }
  }, [courses])
  return <CoursesCtx.Provider value={value}>{children}</CoursesCtx.Provider>
}

/** A lookup from course id to its display; null for none, or one not known. For lists, where a hook per row won't do. */
export function useCourseLookup(): (id: string | null | undefined) => CourseInfo | null {
  const { byId } = useContext(CoursesCtx)
  return useMemo(() => (id: string | null | undefined) => (id ? byId.get(id) ?? null : null), [byId])
}

/** One course's display; null for none, or one not known. */
export function useCourse(id: string | null | undefined): CourseInfo | null {
  return useCourseLookup()(id)
}

/** The courses a picker offers: the active ones, by name. */
export function useActiveCourses(): readonly Course[] {
  const { courses } = useContext(CoursesCtx)
  return useMemo(() => courses.filter((c) => c.archived_at === null), [courses])
}

/** A course's name for a picker or a pill: "History (archived)" when it is. */
export function courseLabel(course: Pick<CourseInfo, 'name' | 'archived'>): string {
  return course.archived ? `${course.name} (archived)` : course.name
}

/**
 * The `<option>`s of a course picker (any select, e.g. `Select` or the
 * board's scope pills): the active courses by name, plus `current` when it
 * is archived, so a picker showing it keeps it. Put a "none" option before
 * them as the picker needs ("All courses", "No course").
 */
export function CourseOptions({ current }: { current?: string | null }) {
  const active = useActiveCourses()
  const shown = useCourse(current)
  return (
    <>
      {shown?.archived && <option value={shown.id}>{courseLabel(shown)}</option>}
      {active.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
    </>
  )
}
