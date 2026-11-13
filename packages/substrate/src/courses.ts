/**
 * Courses: the student's own rows (`courses`, migration 026), each with an
 * opaque id, a display name and a palette colour. Shared by the server
 * router, the CT backend simulator and the client, so all three accept,
 * reject and colour the same things. See
 * plans/product-changes/11-courses-table.md.
 */
import { z } from 'zod'

/**
 * The course palette, in the order new courses take it. Each is a set of
 * `--color-course-<colour>` tokens (apps/web/src/index.css, both themes).
 */
export const COURSE_COLORS = ['green', 'blue', 'purple', 'amber', 'rose', 'teal', 'orange', 'slate'] as const

export type CourseColor = (typeof COURSE_COLORS)[number]

/** Longest course name, in characters (after trimming). */
export const MAX_COURSE_NAME_LENGTH = 60

/**
 * A course as `courses.list` returns it. `id` is what lectures, resources,
 * plan items and board scopes hold: opaque, never shown, never parsed (the
 * three starter courses' ids happen to read like names). Show `name`.
 */
export interface Course {
  id: string
  name: string
  color: CourseColor
  /** When it was archived: hidden from pickers, still shown on what it files. Null = active. */
  archived_at: string | null
}

/**
 * The three courses seeds and the e2e reseed give a student, and that the
 * migration gave every student with data. A new student starts with none.
 */
export const STARTER_COURSES: ReadonlyArray<Pick<Course, 'id' | 'name' | 'color'>> = [
  { id: 'biology', name: 'Biology', color: 'green' },
  { id: 'chemistry', name: 'Chemistry', color: 'blue' },
  { id: 'physics', name: 'Physics', color: 'purple' },
]

/** A course id as a reference in an API input. Whether it is the student's is checked against `courses`. */
export const courseIdInput = z.string().min(1).max(100)

/** A course name: trimmed, 1 to MAX_COURSE_NAME_LENGTH characters. */
export const courseNameInput = z.string().trim().min(1, 'A course needs a name').max(MAX_COURSE_NAME_LENGTH)

export const courseColorInput = z.enum(COURSE_COLORS)

export const newCourseInput = z.object({
  name: courseNameInput,
  /** Left out: the colour the student's active courses use least (`nextCourseColor`). */
  color: courseColorInput.optional(),
})
export type NewCourse = z.infer<typeof newCourseInput>

export const courseUpdateInput = z.object({
  id: courseIdInput,
  name: courseNameInput.optional(),
  color: courseColorInput.optional(),
  /** True archives it, false restores it. */
  archived: z.boolean().optional(),
})
export type CourseUpdate = z.infer<typeof courseUpdateInput>

/** The key two course names collide on: case and surrounding spaces don't count. */
export function courseNameKey(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * The colour a new course gets: the one the student's active courses use
 * least, palette order breaking ties (so the first eight all differ).
 */
export function nextCourseColor(courses: ReadonlyArray<Pick<Course, 'color' | 'archived_at'>>): CourseColor {
  const uses = new Map<CourseColor, number>(COURSE_COLORS.map((c) => [c, 0]))
  for (const c of courses) {
    if (c.archived_at === null && uses.has(c.color)) uses.set(c.color, uses.get(c.color)! + 1)
  }
  let best: CourseColor = COURSE_COLORS[0]
  for (const color of COURSE_COLORS) if (uses.get(color)! < uses.get(best)!) best = color
  return best
}

/** CONFLICT message for a name the student already has, naming an archived match. */
export function duplicateCourseMessage(existing: Pick<Course, 'name' | 'archived_at'>): string {
  return existing.archived_at
    ? `You have an archived course called ${existing.name}`
    : `You already have a course called ${existing.name}`
}

/** CONFLICT message for deleting a course still in use. */
export function courseInUseMessage(name: string, usage: CourseUsage): string {
  const parts = [
    plural(usage.lectures, 'lecture'),
    plural(usage.resources, 'resource'),
    plural(usage.planItems, 'plan item'),
  ].filter((p): p is string => p !== null)
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `${name} is still used by ${list}: archive it instead`
}

/** How many rows file under a course. */
export interface CourseUsage {
  lectures: number
  resources: number
  planItems: number
}

function plural(n: number, noun: string): string | null {
  if (n === 0) return null
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

/** Courses by name (case-insensitive), then id: the order `courses.list` returns. */
export function sortCourses<T extends Pick<Course, 'name' | 'id'>>(courses: ReadonlyArray<T>): T[] {
  return [...courses].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
