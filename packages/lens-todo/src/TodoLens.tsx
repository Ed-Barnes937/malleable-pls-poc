import { useEffect, useState, type FormEvent } from 'react'
import { type LensProps, useLinkedToLecture, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { COURSES, HiddenElsewhere, Select, TextField, formatDuration, useArrivals } from '@pls/shared-ui'
import { Plus } from 'lucide-react'
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

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex min-h-4 items-center justify-between gap-2">
        {/* The panel title already says "To-do"; only add the count. */}
        <span className="text-meta font-semibold text-text-muted">
          {open.length > 0 && `${open.length} to do`}
        </span>
        {hidden}
      </div>

      <RefitBanner course={course} onShowPlanItem={onShowPlanItem} />

      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="To-dos">
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
              onDismiss={stage ? undefined : () => dismiss.mutate(item.id)}
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
