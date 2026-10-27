import { useState, type FormEvent } from 'react'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { COURSES, HiddenElsewhere, Select, TextField, formatDuration } from '@pls/shared-ui'
import { Plus } from 'lucide-react'
import { doneToday, isFromRecording, orderTodos } from './todo-items'
import { TodoRow } from './TodoRow'
import { RefitBanner } from './RefitBanner'

/** Estimates offered when adding a to-do, in minutes. */
const ESTIMATES = [15, 20, 30, 45, 60, 90, 120]

export default function TodoLens({ scope, highlight, onScopeChange, onShowMoment }: LensProps) {
  const reader = useSubstrate()
  const writer = useSubstrateMutations()
  const course = scope.courseTag

  const { data: items, isLoading } = reader.usePlanItems({ kinds: ['task'], statuses: ['open', 'done'], courseTag: course })
  // Unfiltered counterpart, only to say what the course filter leaves out.
  const { data: allOpen } = reader.usePlanItems({ kinds: ['task'], statuses: ['open'] })

  const now = Date.now()
  const open = orderTodos((items ?? []).filter((item) => item.status === 'open'))
  const done = doneToday(items ?? [], now)

  const create = writer.useCreatePlanItem()
  const complete = writer.useCompletePlanItem()
  const dismiss = writer.useDismissPlanItem()
  const update = writer.useUpdatePlanItem()

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

      <RefitBanner course={course} />

      <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto" aria-label="To-dos">
        {open.map((item) => (
          <TodoRow
            key={item.occurrence_key}
            item={item}
            now={now}
            showCourse={!course}
            highlighted={isFromRecording(item, highlight?.recordingId)}
            onToggle={() => complete.mutate(item.id)}
            onDismiss={() => dismiss.mutate(item.id)}
            onScopeChange={onScopeChange}
            onShowMoment={onShowMoment}
          />
        ))}
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
            onToggle={() => update.mutate({ id: item.id, patch: { status: 'open' } })}
            onScopeChange={onScopeChange}
            onShowMoment={onShowMoment}
          />
        ))}
        {!isLoading && open.length === 0 && done.length === 0 && (
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
          wrapperClassName="w-24 shrink-0"
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
        >
          <option value="">Est.</option>
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
