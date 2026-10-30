import { useEffect, useRef, useState, type ReactNode } from 'react'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { COURSES, Dialog, EmptyState, HiddenElsewhere, SectionLabel, Spinner, useNarrowScreen } from '@pls/shared-ui'
import { resourceCourse, type Resource } from '@pls/substrate'
import { ChevronDown, ChevronRight, Library, NotebookPen, Plus, X } from 'lucide-react'
import { AddPanel, type AttachTo } from './AddPanel'
import { groupResources, type LectureGroup } from './grouping'
import { MoveDialog, type Destination } from './MoveDialog'
import { pendingNoteSaver } from './noteSavers'
import { NoteView } from './NoteView'
import { ResourceRow } from './ResourceRow'

/** How long a deleted resource can be brought back before it is deleted for real. */
export const UNDO_DELETE_MS = 5000

/**
 * Deletes after a pause, so "Undo" can cancel; leaving the widget deletes
 * what is still waiting.
 */
function useDeferredDelete(remove: (id: string) => void) {
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const removeRef = useRef(remove)
  removeRef.current = remove

  const commit = (id: string) => {
    timers.current.delete(id)
    removeRef.current(id)
    setPending((ids) => {
      const next = new Set(ids)
      next.delete(id)
      return next
    })
  }

  useEffect(() => {
    const waiting = timers.current
    return () => {
      for (const [id, timer] of waiting) {
        clearTimeout(timer)
        removeRef.current(id)
      }
      waiting.clear()
    }
  }, [])

  return {
    pending,
    start: (id: string) => {
      setPending((ids) => new Set(ids).add(id))
      timers.current.set(id, setTimeout(() => commit(id), UNDO_DELETE_MS))
    },
    undo: (id: string) => {
      clearTimeout(timers.current.get(id))
      timers.current.delete(id)
      setPending((ids) => {
        const next = new Set(ids)
        next.delete(id)
        return next
      })
    },
  }
}

export default function ResourcesLens({ scope, onScopeChange }: LensProps) {
  const reader = useSubstrate()
  const writer = useSubstrateMutations()
  const narrow = useNarrowScreen()
  const course = scope.courseTag
  const lectureId = scope.lectureId

  const { data: scoped, isLoading } = reader.useResources(course ? { courseTag: course } : undefined)
  // Unfiltered counterpart, only to say what the course filter leaves out.
  const { data: all } = reader.useResources()
  const { data: lecture } = reader.useLecture(lectureId)

  const createLink = writer.useCreateResourceLink()
  const createNote = writer.useCreateResourceNote()
  const update = writer.useUpdateResource()
  const remove = writer.useDeleteResource()
  const deletes = useDeferredDelete((id) => remove.mutate(id))

  const [adding, setAdding] = useState(false)
  const [openNote, setOpenNote] = useState<string | null>(null)
  const [moving, setMoving] = useState<Resource | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Asking whether to leave a note whose changes won't save without the student.
  const [leaving, setLeaving] = useState(false)

  const courseLabel = COURSES.find((c) => c.value === course)?.label ?? course
  const now = Date.now()

  /** Where a new item goes: the lecture, or the board course (none on "All courses"). */
  const target = (attachTo: AttachTo) =>
    attachTo === 'lecture' && lectureId ? { lectureId } : { courseTag: course ?? null }

  const addLink = async (url: string, attachTo: AttachTo) => {
    await createLink.mutateAsync({ url, ...target(attachTo) })
    setAdding(false)
  }

  const writeNote = async (attachTo: AttachTo) => {
    setError(null)
    try {
      const note = await createNote.mutateAsync(target(lectureId ? attachTo : 'course'))
      setAdding(false)
      setOpenNote(note.id)
    } catch {
      setError("Couldn't start a note. Try again.")
    }
  }

  const move = (resource: Resource, to: Destination) => {
    const patch = to === 'unfiled' ? { lectureId: null, courseTag: null } : 'lectureId' in to ? { lectureId: to.lectureId } : { courseTag: to.courseTag }
    setError(null)
    update.mutateAsync({ id: resource.id, patch }).catch(() => setError(`Couldn't move ${resource.title}. Try again.`))
  }

  const rename = (resource: Resource, title: string) => {
    setError(null)
    update.mutateAsync({ id: resource.id, patch: { title } }).catch(() => setError(`Couldn't rename ${resource.title}. Try again.`))
  }

  /**
   * Back to the list. Changes still to save carry on saving; changes that
   * won't (a conflict, a failed save) are kept, but the student is asked first.
   */
  const closeNote = (anyway = false) => {
    if (!openNote) return
    const saver = pendingNoteSaver(openNote)
    if (saver?.stuck && !anyway) {
      setLeaving(true)
      return
    }
    saver?.flush()
    setLeaving(false)
    setOpenNote(null)
  }
  const leavingPrompt = leaving ? { onStay: () => setLeaving(false), onLeave: () => closeNote(true) } : undefined

  // A note open in the widget swaps the list for the editor; on a phone it is full screen.
  if (openNote && !narrow) {
    return <NoteView noteId={openNote} onBack={() => closeNote()} leaving={leavingPrompt} />
  }

  // Rows waiting to be deleted stay in place, as "Deleted · Undo".
  const sections = groupResources(scoped ?? [], lectureId)
  const shownCount = (scoped ?? []).filter((r) => !deletes.pending.has(r.id)).length
  const hidden = course && scoped && all && (
    <HiddenElsewhere
      scopedCount={scoped.length}
      unscopedCount={all.length}
      noCourseCount={all.filter((r) => !resourceCourse(r)).length}
      className="text-right"
    />
  )

  const row = (resource: Resource) => (
    <ResourceRow
      key={resource.id}
      resource={resource}
      now={now}
      showCourse={!course}
      onOpenNote={setOpenNote}
      onRename={(title) => rename(resource, title)}
      onMove={() => setMoving(resource)}
      onDelete={() => deletes.start(resource.id)}
      deleted={deletes.pending.has(resource.id) ? { onUndo: () => deletes.undo(resource.id) } : undefined}
    />
  )

  const addButton = (
    <button
      type="button"
      aria-expanded={adding}
      onClick={() => setAdding((a) => !a)}
      className="inline-flex h-8 shrink-0 items-center gap-1 rounded-item px-2 text-body font-semibold text-accent hover:bg-accent-soft"
    >
      {adding ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
      {adding ? 'Cancel' : 'Add'}
    </button>
  )

  const nothingAtAll = !isLoading && (scoped?.length ?? 0) === 0 && !lectureId

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-8 items-center justify-between gap-2">
        {hidden || <span />}
        {!nothingAtAll || adding ? addButton : null}
      </div>

      {adding && (
        <AddPanel
          lectureTitle={lectureId ? lecture?.title ?? 'Selected lecture' : undefined}
          courseChoiceLabel={courseLabel ? `Whole course: ${courseLabel}` : 'No course'}
          onAddLink={addLink}
          onWriteNote={(attachTo) => void writeNote(attachTo)}
          busy={createLink.isPending || createNote.isPending}
        />
      )}
      {error && <p role="alert" className="text-meta text-attn">{error}</p>}

      {isLoading ? (
        <div className="flex flex-1 items-center justify-center"><Spinner /></div>
      ) : nothingAtAll && !adding ? (
        <EmptyState
          icon={Library}
          message={courseLabel ? `Nothing for ${courseLabel} yet` : 'Keep links and notes for your courses here'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-control bg-accent px-3 text-body font-semibold text-accent-foreground"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Add link
              </button>
              <button
                type="button"
                onClick={() => void writeNote('course')}
                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border px-3 text-body font-semibold text-text-primary hover:bg-surface-overlay"
              >
                <NotebookPen className="h-4 w-4" aria-hidden />
                Write a note
              </button>
            </div>
          }
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto" data-testid="resource-list" data-count={shownCount}>
          {sections.lecture && (
            <section aria-label="This lecture">
              <SectionLabel className="flex items-baseline gap-1.5">
                <span>This lecture</span>
                {lecture && <span className="truncate font-normal">{lecture.title}</span>}
              </SectionLabel>
              {sections.lecture.length > 0 ? (
                <ul aria-label="This lecture's resources">{sections.lecture.map(row)}</ul>
              ) : (
                <p className="py-2 text-body text-text-muted">Nothing for this lecture yet</p>
              )}
            </section>
          )}
          {sections.course.length > 0 && (
            <section aria-label={lectureId ? 'Course' : 'Resources'}>
              {lectureId && <SectionLabel>{courseLabel ? `${courseLabel} course` : 'Not in a lecture'}</SectionLabel>}
              <ul aria-label={lectureId ? 'Course resources' : 'Resources'}>{sections.course.map(row)}</ul>
            </section>
          )}
          {sections.otherLectures.length > 0 && (
            <LectureGroups
              label={lectureId ? 'Other lectures' : 'In lectures'}
              groups={sections.otherLectures}
              onFocusLecture={(id) => void onScopeChange?.({ lectureId: id })}
              row={row}
            />
          )}
        </div>
      )}

      {moving && <MoveDialog resource={moving} onMove={(to) => move(moving, to)} onClose={() => setMoving(null)} />}

      {openNote && narrow && (
        <Dialog
          open
          onClose={() => closeNote()}
          title="Note"
          className="fixed inset-0 flex h-dvh w-screen max-w-none flex-col rounded-none border-0 p-4"
        >
          <div className="min-h-0 flex-1">
            <NoteView noteId={openNote} leaving={leavingPrompt} />
          </div>
        </Dialog>
      )}
    </div>
  )
}

/**
 * Resources of lectures other than the selected one, collapsed under one
 * heading with a count, then grouped by lecture. Pressing a lecture's title
 * selects it on the board.
 */
function LectureGroups({ label, groups, onFocusLecture, row }: {
  label: string
  groups: LectureGroup[]
  onFocusLecture: (lectureId: string) => void
  row: (resource: Resource) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const count = groups.reduce((n, g) => n + g.resources.length, 0)
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <section aria-label={label}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1 rounded-item pr-2 text-meta font-semibold text-text-muted hover:text-text-primary"
      >
        <Chevron className="h-4 w-4" aria-hidden />
        {label} ({count})
      </button>
      {open &&
        groups.map((group) => (
          <div key={group.lectureId} className="mt-1 pl-5">
            <button
              type="button"
              onClick={() => onFocusLecture(group.lectureId)}
              title="Show this lecture on the board"
              className="text-left text-meta font-semibold text-accent hover:underline"
            >
              {group.title}
            </button>
            <ul aria-label={`${group.title} resources`}>{group.resources.map(row)}</ul>
          </div>
        ))}
    </section>
  )
}
