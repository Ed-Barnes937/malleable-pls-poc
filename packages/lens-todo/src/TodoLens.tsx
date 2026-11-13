import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { bookedMinutes, isSession, partBooking } from '@pls/substrate'
import { type LensProps, useDraftUndo, useLinkedToLecture, useSubstrate, useSubstrateMutations, confirmWithUndo } from '@pls/lens-framework'
import { HiddenElsewhere, Select, TextField, formatDuration, useArrivals, useCourse, useEnterOnce, useListGlide } from '@pls/shared-ui'
import { ChevronDown, Plus } from 'lucide-react'
import { doneToday, orderTodos } from './todo-items'
import { TodoRow } from './TodoRow'
import { RefitBanner } from './RefitBanner'
import { BookTheRest } from './BookTheRest'
import { useJustDone } from './useJustDone'
import { useStatusWrites } from './useStatusWrites'

/** Estimates offered when adding a to-do, in minutes. */
const ESTIMATES = [15, 20, 30, 45, 60, 90, 120]

export default function TodoLens({ scope, highlight, onScopeChange, onShowMoment, asksAboutMissedBlocks, onNotify, onDismissNotice }: LensProps) {
  // Rings to-dos made from the board's lecture's moments.
  const fromLecture = useLinkedToLecture(highlight?.lectureId)
  const reader = useSubstrate()
  const writer = useSubstrateMutations()
  const course = scope.courseTag

  // Sessions (study blocks of a to-do split by Auto-fill) are its time, not to-dos of their own.
  const { data: taskRows, isLoading } = reader.usePlanItems({ kinds: ['task'], statuses: ['open', 'done'], courseTag: course })
  const items = useMemo(() => taskRows?.filter((item) => !isSession(item)), [taskRows])
  // Time booked per to-do (its own block or its sessions): a resize never changes the estimate.
  const booked = useMemo(() => bookedMinutes(taskRows ?? []), [taskRows])
  // Undo for a re-fit move or Book the rest; its toast goes once a block it changed is edited.
  const draftUndo = useDraftUndo({ onNotify, onDismissNotice, rows: taskRows })
  /** The to-do whose rest is being drafted here (Book the rest). */
  const [bookingRest, setBookingRest] = useState<string | null>(null)
  // Unfiltered counterpart, only to say what the course filter leaves out.
  const { data: allTaskRows } = reader.usePlanItems({ kinds: ['task'], statuses: ['open'] })
  const allOpen = useMemo(() => allTaskRows?.filter((item) => !isSession(item)), [allTaskRows])

  const create = writer.useCreatePlanItem()
  const complete = writer.useCompletePlanItem()
  const dismiss = writer.useDismissPlanItem()
  const update = writer.useUpdatePlanItem()

  // A ticked to-do stays where it was for a moment, struck through, with
  // "Done · Undo", then fades and moves down to "Done today".
  const justDone = useJustDone()
  // Ticks and Undos on one to-do save in order, and show at once.
  const status = useStatusWrites(
    (id, next) => (next === 'done' ? complete.mutateAsync(id) : update.mutateAsync({ id, patch: { status: 'open' } })),
    justDone.remove,
  )
  const tick = (id: string) => {
    justDone.add(id)
    status.setStatus(id, 'done')
  }
  const reopen = (id: string) => {
    justDone.remove(id)
    status.setStatus(id, 'open')
  }
  // Removing ("Not doing") is confirmed with Undo, which brings the to-do
  // back with the sessions it closed. A tick has its own "Done · Undo".
  const undismiss = writer.useUndismissPlanItem()
  const removeTodo = (item: { id: string; title: string }) => {
    dismiss.mutateAsync(item.id).then(() => confirmWithUndo(onNotify, {
      key: 'todo-removed',
      message: `Removed "${item.title}"`,
      failMessage: `Couldn't bring back "${item.title}".`,
      undo: () => undismiss.mutateAsync(item.id),
    }), () => {})
  }
  // Reopened elsewhere (another device, the Calendar) while its tick was
  // saving: once saved, it shows open, not "Done · Undo".
  const { stages: justDoneStages, remove: removeJustDone } = justDone
  const { isSaving } = status
  useEffect(() => {
    for (const id of justDoneStages.keys()) {
      if (!isSaving(id) && items?.find((item) => item.id === id)?.status === 'open') removeJustDone(id)
    }
  }, [items, justDoneStages, removeJustDone, isSaving])

  const now = Date.now()
  // Rows as the student last left them, while their saves are on the way.
  const shown = (items ?? []).map((item) => {
    const s = status.statusOf(item)
    return s === item.status ? item : { ...item, status: s }
  })
  const open = orderTodos(shown.filter((item) => item.status === 'open' && !justDone.stages.has(item.id)))
  // Open and just-ticked to-dos in one list, so a ticked one keeps its place.
  const listed = orderTodos(shown.filter((item) => item.status === 'open' || justDone.stages.has(item.id)))
  const done = doneToday(shown.filter((item) => !justDone.stages.has(item.id)), now)

  // To-dos that arrive while the list is open (e.g. a review just added) slide in.
  const arrived = useArrivals(items?.map((i) => i.id), course ?? '')
  const entering = useEnterOnce(arrived)
  // A to-do ticked here drops into "Done today" (and the heading, the first
  // time) with the same motion; what was done before the list opened doesn't.
  const doneArrived = useArrivals(items && [...done.map((i) => i.occurrence_key), ...(done.length ? [DONE_HEADING] : [])], course ?? '')
  const doneEntering = useEnterOnce(doneArrived)

  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    create.mutate({
      kind: 'task',
      title: trimmed,
      duration_min: estimate ? Number(estimate) : null,
      // New to-dos inherit the board course.
      course: course ?? null,
    })
    setTitle('')
    setEstimate('')
  }

  const courseLabel = useCourse(course)?.name
  // Only once both lists are in, so the hint never flashes a wrong count.
  const hidden = items && allOpen && (
    <HiddenElsewhere
      scopedCount={open.length}
      unscopedCount={allOpen.length}
      noCourseCount={allOpen.filter((item) => !item.course).length}
      className="text-right"
    />
  )

  const listRef = useRef<HTMLUListElement>(null)
  useListGlide(listRef, [...listed, ...done].map((item) => item.occurrence_key))
  const moreBelow = useMoreBelow(listRef, listed.length + done.length)

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-4 items-center justify-between gap-2">
        {/* The panel title already says "To-do"; only add the count. */}
        <span className="text-meta font-semibold text-text-muted">
          {open.length > 0 && `${open.length} to do`}
        </span>
        {hidden}
      </div>

      {/* A board asks once: here only when it has no Calendar (decision 4). */}
      {asksAboutMissedBlocks !== false && <RefitBanner course={course} undo={draftUndo} />}

      <ul ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="To-dos">
        {listed.map((item) => {
          const stage = justDone.stages.get(item.id)
          const booking = stage ? null : partBooking(item, booked)
          return (
            <TodoRow
              key={item.occurrence_key}
              item={item}
              now={now}
              showCourse={!course}
              highlighted={!stage && fromLecture(item)}
              fresh={arrived.has(item.id)}
              enter={entering(item.id)}
              justDone={stage && { fading: stage === 'fading', onUndo: () => reopen(item.id) }}
              onToggle={() => (stage ? reopen(item.id) : tick(item.id))}
              onDismiss={stage ? undefined : () => removeTodo(item)}
              booking={booking}
              onBookRest={booking && bookingRest !== item.id ? () => setBookingRest(item.id) : undefined}
              onScopeChange={onScopeChange}
              onShowMoment={onShowMoment}
            >
              {booking && bookingRest === item.id && (
                <BookTheRest todo={item} restMin={booking.restMin} now={now} undo={draftUndo} onClose={() => setBookingRest(null)} />
              )}
            </TodoRow>
          )
        })}
        {done.length > 0 && (
          <DoneHeading enter={doneEntering(DONE_HEADING)} />
        )}
        {done.map((item) => (
          <TodoRow
            key={item.occurrence_key}
            item={item}
            now={now}
            showCourse={!course}
            highlighted={false}
            enter={doneEntering(item.occurrence_key)}
            onToggle={() => reopen(item.id)}
            onScopeChange={onScopeChange}
            onShowMoment={onShowMoment}
          />
        ))}
        {!isLoading && listed.length === 0 && done.length === 0 && (
          <li className="flex flex-1 items-center justify-center text-body text-text-muted">
            Nothing to do yet. Add something below.
          </li>
        )}
      </ul>
      {/* Rows out of view below say so, so "9 to do" over two rows doesn't read as lost items. Under the list, not over it: it never covers a row. */}
      {moreBelow > 0 && (
        <button
          type="button"
          data-testid="todo-more-below"
          onClick={() => listRef.current?.scrollBy({ top: listRef.current.clientHeight * 0.8, behavior: 'smooth' })}
          className="-mt-1 flex min-h-8 shrink-0 items-center justify-center gap-1 self-center rounded-full px-3 text-meta font-semibold text-text-secondary hover:bg-surface-overlay hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {moreBelow} more
          <ChevronDown className="h-3 w-3" aria-hidden />
        </button>
      )}

      <form onSubmit={submit} className="flex items-center gap-2">
        <TextField
          aria-label="New to-do"
          className="min-w-0"
          placeholder={courseLabel ? `Add a ${courseLabel} to-do` : 'Add a to-do'}
          value={title}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Select
          aria-label="Time estimate"
          title="Time estimate (optional)"
          wrapperClassName="w-28 shrink-0"
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
        >
          <option value="">How long?</option>
          {ESTIMATES.map((min) => (
            <option key={min} value={min}>
              {formatDuration(min)}
            </option>
          ))}
        </Select>
        <button
          type="submit"
          aria-label="Add to-do"
          title="Add to-do"
          disabled={!title.trim()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control bg-accent-soft text-accent transition-colors hover:bg-accent-line disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
      </form>
    </div>
  )
}

/** How many of the list's rows are wholly out of view below it; follows scrolling, resizing and the row count. */
function useMoreBelow(ref: RefObject<HTMLElement | null>, rows: number): number {
  const [more, setMore] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const bottom = el.getBoundingClientRect().bottom
      setMore([...el.children].filter((row) => row.tagName === 'LI' && row.getBoundingClientRect().top >= bottom - 1).length)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      resize.disconnect()
    }
  }, [ref, rows])
  return more
}

/** The key "Done today" arrives under (see `doneArrived`). */
const DONE_HEADING = 'done-today-heading'

function DoneHeading({ enter }: { enter: boolean }) {
  // Kept from mount: the motion plays as it arrives, not on later renders.
  const [entering] = useState(enter)
  return (
    <li data-testid="todo-done-heading" className={entering ? 'origin-top pb-1 pt-4 text-meta font-semibold text-text-muted motion-safe:animate-enter' : 'pb-1 pt-4 text-meta font-semibold text-text-muted'}>
      Done today
    </li>
  )
}
