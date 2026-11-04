import { useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { type LensProps, useLinkedToLecture, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { COURSES, HiddenElsewhere, Select, TextField, formatDuration, useArrivals } from '@pls/shared-ui'
import { ChevronDown, Plus } from 'lucide-react'
// PROTOTYPE p3 (flow audit feedback and motion): throwaway, never merged.
import { p3, p3Confirm, useP3CalendarOnBoard } from '@pls/shared-ui'
import { doneToday, orderTodos } from './todo-items'
import { TodoRow } from './TodoRow'
import { RefitBanner } from './RefitBanner'
import { useJustDone } from './useJustDone'
import { useStatusWrites } from './useStatusWrites'

/** Estimates offered when adding a to-do, in minutes. */
const ESTIMATES = [15, 20, 30, 45, 60, 90, 120]

export default function TodoLens({ scope, highlight, onScopeChange, onShowMoment, onShowPlanItem }: LensProps) {
  // Rings to-dos made from the board's lecture's moments.
  const fromLecture = useLinkedToLecture(highlight?.lectureId)
  const reader = useSubstrate()
  const writer = useSubstrateMutations()
  const course = scope.courseTag
  const calendarOnBoard = useP3CalendarOnBoard()

  const { data: items, isLoading } = reader.usePlanItems({ kinds: ['task'], statuses: ['open', 'done'], courseTag: course })
  // Unfiltered counterpart, only to say what the course filter leaves out.
  const { data: allOpen } = reader.usePlanItems({ kinds: ['task'], statuses: ['open'] })

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
    // PROTOTYPE p3: b confirms a tick with an Undo toast (a and c keep the row's own "Done · Undo").
    const title = items?.find((i) => i.id === id)?.title
    p3Confirm({ kind: 'small', key: `p3-ticked`, message: `Ticked off "${title ?? 'to-do'}"`, undo: () => reopen(id) })
  }
  const reopen = (id: string) => {
    justDone.remove(id)
    status.setStatus(id, 'open')
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

  const [title, setTitle] = useState('')
  const [estimate, setEstimate] = useState('')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    create.mutateAsync({
      kind: 'task',
      title: trimmed,
      duration_min: estimate ? Number(estimate) : null,
      // New to-dos inherit the board course.
      course: course ?? null,
    }).then((item) => {
      // PROTOTYPE p3: b confirms an add with Undo; a is quiet (the row arriving is the confirmation).
      p3Confirm({ kind: 'small', key: 'p3-todo-added', message: `Added "${trimmed}"`, undo: () => dismiss.mutateAsync(item.id) })
    }, () => {})
    setTitle('')
    setEstimate('')
  }

  const courseLabel = COURSES.find((c) => c.value === course)?.label ?? course
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

      {/* PROTOTYPE p3: in a and b the re-fit prompt shows once per board, in the Calendar when there is one (decision 4). */}
      {!(p3 !== 'c' && calendarOnBoard) && <RefitBanner course={course} onShowPlanItem={onShowPlanItem} />}

      <ul ref={listRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="To-dos">
        {listed.map((item) => {
          const stage = justDone.stages.get(item.id)
          return (
            <TodoRow
              key={item.occurrence_key}
              item={item}
              now={now}
              showCourse={!course}
              highlighted={!stage && fromLecture(item)}
              fresh={arrived.has(item.id)}
              justDone={stage && { fading: stage === 'fading', onUndo: () => reopen(item.id) }}
              onToggle={() => (stage ? reopen(item.id) : tick(item.id))}
              onDismiss={stage ? undefined : () => {
                dismiss.mutate(item.id)
                // PROTOTYPE p3: removing a to-do is destructive: a and b confirm it with Undo.
                p3Confirm({
                  kind: 'destructive',
                  key: 'p3-todo-removed',
                  message: `Removed "${item.title}"`,
                  undo: () => update.mutateAsync({ id: item.id, patch: { status: 'open' } }),
                })
              }}
              onScopeChange={onScopeChange}
              onShowMoment={onShowMoment}
            />
          )
        })}
        {done.length > 0 && (
          <li className="pb-1 pt-4 text-meta font-semibold text-text-muted">Done today</li>
        )}
        {done.map((item) => (
          <TodoRow
            key={item.occurrence_key}
            item={item}
            now={now}
            showCourse={!course}
            highlighted={false}
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
