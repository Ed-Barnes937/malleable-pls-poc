import { useId, useState } from 'react'
import { Archive, ArchiveRestore, ChevronRight, Trash2 } from 'lucide-react'
import { useCourseUsage, useDeleteCourse, useUpdateCourse } from '@pls/substrate-client'
import { COURSE_COLORS, MAX_COURSE_NAME_LENGTH, courseInUse, type Course, type CourseColor, type CourseUses } from '@pls/substrate'
import { Dialog, IconButton, cn, courseTone, useAllCourses } from '@pls/shared-ui'
import { useToastStore } from './toast'

/** "1 lecture", "2 lectures". */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * What uses a course, for its row: "Used by 2 lectures and 3 plan items",
 * or "Not used yet". Boards on it are named too, though they never keep it
 * from being deleted (they go back to All courses).
 */
export function courseUsageLabel(usage: Omit<CourseUses, 'id'>): string {
  const parts = [
    usage.lectures > 0 && count(usage.lectures, 'lecture', 'lectures'),
    usage.resources > 0 && count(usage.resources, 'resource', 'resources'),
    usage.planItems > 0 && count(usage.planItems, 'plan item', 'plan items'),
    usage.boards > 0 && count(usage.boards, 'board', 'boards'),
  ].filter((p): p is string => !!p)
  if (parts.length === 0) return 'Not used yet'
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0]
  return `Used by ${list}`
}

const COLOR_NAMES: Record<CourseColor, string> = {
  green: 'Green',
  blue: 'Blue',
  purple: 'Purple',
  amber: 'Amber',
  rose: 'Rose',
  teal: 'Teal',
  orange: 'Orange',
  slate: 'Slate',
}

/** A tRPC error's code and message, if it is one. */
function errorOf(err: unknown): { code?: string; message?: string } {
  const e = err as { data?: { code?: string } | null; message?: string }
  return { code: e.data?.code, message: e.message }
}

/**
 * The student's courses, from the board header's "Edit courses...": each
 * with its colour (a palette under the swatch), its name (edited in place:
 * Enter or leaving the field saves, Escape puts it back), Archive and
 * Delete. Delete is only for a course nothing files under; otherwise its
 * row says what uses it, and Archive hides it from pickers instead.
 * Archived courses sit under a collapsed "Archived", with Restore. Every
 * change shows at once wherever the course is shown.
 */
export function CoursesDialog({ onClose }: { onClose: () => void }) {
  const courses = useAllCourses()
  const { data: usage } = useCourseUsage()
  const [error, setError] = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const active = courses.filter((c) => c.archived_at === null)
  const archived = courses.filter((c) => c.archived_at !== null)
  const usageOf = (id: string) => usage?.find((u) => u.id === id)

  return (
    <Dialog
      open
      onClose={onClose}
      title="Courses"
      // Full width on a phone; the list scrolls between the title and Done.
      className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md flex-col"
    >
      <div data-testid="courses-dialog" className="flex min-h-0 flex-col gap-3">
        <div className="-mx-1 min-h-0 overflow-y-auto px-1">
          {active.length === 0 && <p className="py-2 text-body text-text-secondary">All your courses are archived.</p>}
          <ul className="flex flex-col gap-1">
            {active.map((course) => (
              <CourseRow key={course.id} course={course} usage={usageOf(course.id)} onError={setError} />
            ))}
          </ul>
          {archived.length > 0 && (
            <div className="mt-3 border-t border-border-subtle pt-2">
              <button
                type="button"
                aria-expanded={showArchived}
                onClick={() => setShowArchived((v) => !v)}
                className="flex h-9 items-center gap-1 rounded-item px-1 text-meta font-semibold text-text-secondary hover:text-text-primary"
              >
                <ChevronRight aria-hidden className={cn('h-3.5 w-3.5 transition-transform', showArchived && 'rotate-90')} />
                Archived ({archived.length})
              </button>
              {showArchived && (
                <ul className="mt-1 flex flex-col gap-1" aria-label="Archived courses">
                  {archived.map((course) => (
                    <CourseRow key={course.id} course={course} usage={usageOf(course.id)} onError={setError} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {error && <p role="alert" className="text-meta text-confused">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            autoFocus
            onClick={onClose}
            className="h-9 rounded-control bg-accent px-3.5 text-body font-medium text-accent-foreground transition-colors hover:bg-accent/90"
          >
            Done
          </button>
        </div>
      </div>
    </Dialog>
  )
}

function CourseRow({ course, usage, onError }: {
  course: Course
  /** Not known yet: Delete waits for it. */
  usage: CourseUses | undefined
  onError: (message: string | null) => void
}) {
  const update = useUpdateCourse()
  const remove = useDeleteCourse()
  const pushToast = useToastStore((s) => s.push)
  const [picking, setPicking] = useState(false)
  const usageId = useId()
  const isArchived = course.archived_at !== null
  const inUse = !usage || courseInUse(usage)

  const save = (patch: { name?: string; color?: CourseColor; archived?: boolean }) => {
    onError(null)
    update.mutateAsync({ id: course.id, ...patch }).catch((err: unknown) => {
      const { code, message } = errorOf(err)
      onError(code === 'CONFLICT' && message ? message : "Couldn't save the course - try again")
    })
  }

  const deleteCourse = () => {
    onError(null)
    remove.mutateAsync(course.id).then(
      () => pushToast({ message: `Deleted ${course.name}`, tone: 'success', key: 'course-delete' }),
      (err: unknown) => {
        const { code, message } = errorOf(err)
        // Something was filed under it since: say what, and archive instead.
        onError(code === 'CONFLICT' && message ? message : "Couldn't delete the course - try again")
      },
    )
  }

  return (
    <li data-testid="course-row" data-course={course.id} className="flex flex-col gap-1 rounded-item py-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Colour for ${course.name}: ${COLOR_NAMES[course.color]}`}
          aria-expanded={picking}
          onClick={() => setPicking((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <span data-testid="course-swatch" data-color={course.color} className={cn('h-4 w-4 rounded-full', courseTone(course.color).stripe)} />
        </button>
        <div className="min-w-0 flex-1">
          {/* Keyed by the name: a rename, saved or refused, shows what the course is now called. */}
          <NameField key={course.name} course={course} describedBy={usageId} onSave={(name) => save({ name })} />
          <p id={usageId} data-testid="course-usage" className="px-1 pt-0.5 text-meta text-text-muted">
            {usage ? courseUsageLabel(usage) : ' '}
          </p>
        </div>
        <IconButton
          icon={isArchived ? ArchiveRestore : Archive}
          size="md"
          label={`${isArchived ? 'Restore' : 'Archive'} ${course.name}`}
          title={isArchived ? 'Restore: back in course lists' : 'Archive: hide from course lists, keep everything filed under it'}
          onClick={() => save({ archived: !isArchived })}
        />
        {/* A span around it, so the reason shows on hover while it is disabled. */}
        <span title={usage && inUse ? 'In use - archive it instead' : 'Delete this course'} className="shrink-0">
          <IconButton
            icon={Trash2}
            size="md"
            label={`Delete ${course.name}`}
            disabled={inUse || remove.isPending}
            aria-describedby={usageId}
            onClick={deleteCourse}
          />
        </span>
      </div>
      {picking && (
        <div role="radiogroup" aria-label={`Colour for ${course.name}`} className="flex flex-wrap gap-1 pl-10">
          {COURSE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={color === course.color}
              aria-label={COLOR_NAMES[color]}
              onClick={() => {
                setPicking(false)
                if (color !== course.color) save({ color })
              }}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full hover:bg-surface-overlay focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
                color === course.color && 'ring-2 ring-border',
              )}
            >
              <span aria-hidden className={cn('h-4 w-4 rounded-full', courseTone(color).stripe)} />
            </button>
          ))}
        </div>
      )}
    </li>
  )
}

/** A course's name, edited in place: Enter or leaving it saves a changed, non-empty name; Escape puts it back. */
function NameField({ course, describedBy, onSave }: { course: Course; describedBy: string; onSave: (name: string) => void }) {
  const [value, setValue] = useState(course.name)
  const finish = () => {
    const name = value.trim()
    if (!name) return setValue(course.name)
    if (name !== course.name) onSave(name)
  }
  return (
    <input
      aria-label={`Name of ${course.name}`}
      aria-describedby={describedBy}
      value={value}
      maxLength={MAX_COURSE_NAME_LENGTH}
      onChange={(e) => setValue(e.target.value)}
      onBlur={finish}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape' && value !== course.name) {
          // Puts the name back; a second Escape closes the dialog.
          e.stopPropagation()
          setValue(course.name)
        }
      }}
      className="h-9 w-full min-w-0 rounded-control border border-transparent bg-transparent px-1 text-body font-medium text-text-primary hover:border-border focus:border-accent focus:ring-2 focus:ring-accent-line focus:outline-none"
    />
  )
}
