import { createContext, useCallback, useContext, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { nextCourseColor, MAX_COURSE_NAME_LENGTH, type Course, type NewCourse } from '@pls/substrate'
import { courseTone, type CourseTone } from './constants'
import { Dialog } from './Dialog'
import { TextField } from './TextField'
import { cn } from './utils'

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

/** Makes a course (`courses.create`); resolves once the course is in the list the provider holds. */
export type CreateCourse = (input: NewCourse) => Promise<Course>

interface CoursesValue {
  courses: readonly Course[]
  byId: ReadonlyMap<string, CourseInfo>
  create: CreateCourse
}

const noCreate: CreateCourse = () => Promise.reject(new Error('No courses provider'))
const EMPTY: CoursesValue = { courses: [], byId: new Map(), create: noCreate }
const CoursesCtx = createContext<CoursesValue>(EMPTY)

export function courseInfo(course: Course): CourseInfo {
  return { id: course.id, name: course.name, tone: courseTone(course.color), archived: course.archived_at !== null }
}

/**
 * Provides the student's courses (archived ones included), as `courses.list`
 * returns them, and `create` for every picker's "New course...".
 */
export function CoursesProvider({ courses, create, children }: {
  courses: readonly Course[] | null | undefined
  create?: CreateCourse
  children: ReactNode
}) {
  const value = useMemo<CoursesValue>(() => ({
    courses: courses ?? [],
    byId: courses ? new Map(courses.map((c) => [c.id, courseInfo(c)])) : EMPTY.byId,
    create: create ?? noCreate,
  }), [courses, create])
  return <CoursesCtx.Provider value={value}>{children}</CoursesCtx.Provider>
}

/** Every course of the student's, archived ones included, by name. */
export function useAllCourses(): readonly Course[] {
  return useContext(CoursesCtx).courses
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
 * A course picker's "New course..." choice (`CourseOptions`). Not a course
 * id: a picker opens the new course dialog for it (`useNewCourse`) rather
 * than choose it.
 */
export const NEW_COURSE = '__new-course__'

/** Shown, disabled, in a picker while the student has no active courses. */
const NO_COURSES_YET = '__no-courses-yet__'

/** Copy for a picker with no courses to offer, before "New course...". */
export const NO_COURSES_YET_LABEL = 'No courses yet'
export const NEW_COURSE_LABEL = 'New course...'

/**
 * The `<option>`s of a course picker (any select, e.g. `Select` or the
 * board's scope pills): the active courses by name, plus `current` when it
 * is archived, so a picker showing it keeps it, then "New course..."
 * (`NEW_COURSE`, which the picker hands to `useNewCourse`). With no active
 * courses, a disabled "No courses yet" says why the list is empty. Put a
 * "none" option before them as the picker needs ("All courses", "No
 * course").
 */
export function CourseOptions({ current }: { current?: string | null }) {
  const active = useActiveCourses()
  const shown = useCourse(current)
  return (
    <>
      {shown?.archived && <option value={shown.id}>{courseLabel(shown)}</option>}
      {active.length === 0 && <option value={NO_COURSES_YET} disabled>{NO_COURSES_YET_LABEL}</option>}
      {active.map((c) => (
        <option key={c.id} value={c.id}>{c.name}</option>
      ))}
      <option value={NEW_COURSE}>{NEW_COURSE_LABEL}</option>
    </>
  )
}

/**
 * "New course..." for a picker: `open(picker)` shows the new course dialog,
 * and a course made there is handed to `onCreated` (the picker selects it).
 * Focus then goes back to `picker` (a click doesn't focus a select
 * everywhere), else to whatever had it when the dialog opened. Render
 * `dialog` anywhere in the picker.
 */
export function useNewCourse(onCreated: (course: Course) => void): { open: (picker?: HTMLElement | null) => void; dialog: ReactNode } {
  const [open, setOpen] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const onCreatedRef = useRef(onCreated)
  onCreatedRef.current = onCreated
  const close = useCallback((course: Course | null) => {
    setOpen(false)
    if (course) onCreatedRef.current(course)
    const back = opener.current
    opener.current = null
    // After the dialog has gone, and with it the focus it held.
    requestAnimationFrame(() => back?.focus())
  }, [])
  const show = useCallback((picker?: HTMLElement | null) => {
    opener.current = picker ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    setOpen(true)
  }, [])
  return { open: show, dialog: open && <NewCourseDialog onClose={close} /> }
}

/**
 * Asks for a new course's name; its colour is the one the student's active
 * courses use least (shown beside the name). CONFLICT for a name they have
 * already is shown under the field.
 */
function NewCourseDialog({ onClose }: { onClose: (course: Course | null) => void }) {
  const { courses, create } = useContext(CoursesCtx)
  const color = useMemo(() => nextCourseColor(courses), [courses])
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const cancel = useCallback(() => onClose(null), [onClose])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    // Only this dialog's form, not one the picker sits in (a new board).
    e.stopPropagation()
    if (!name.trim() || saving) return
    setSaving(true)
    setError(null)
    create({ name: name.trim(), color }).then(
      (course) => onClose(course),
      (err: { data?: { code?: string } | null; message?: string }) => {
        setSaving(false)
        setError(err.data?.code === 'CONFLICT' && err.message ? err.message : "Couldn't add the course - try again")
      },
    )
  }

  return (
    <Dialog open onClose={cancel} title="New course" className="w-[calc(100vw-2rem)] max-w-sm">
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="new-course-dialog">
        <div>
          <label htmlFor="new-course-name" className="mb-1.5 block text-meta font-semibold text-text-secondary">Name</label>
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              data-testid="new-course-color"
              data-color={color}
              className={cn('h-4 w-4 shrink-0 rounded-full', courseTone(color).stripe)}
            />
            <TextField
              id="new-course-name"
              value={name}
              autoFocus
              maxLength={MAX_COURSE_NAME_LENGTH}
              placeholder="e.g. History"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'new-course-error' : undefined}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
            />
          </div>
          {error && <p id="new-course-error" role="alert" className="mt-1.5 text-meta text-confused">{error}</p>}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={cancel}
            className="h-9 rounded-control px-3.5 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!name.trim() || saving}
            className="h-9 rounded-control bg-accent px-3.5 text-body font-medium text-accent-foreground transition-colors hover:bg-accent/90 disabled:opacity-40"
          >
            {saving ? 'Adding...' : 'Add course'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
