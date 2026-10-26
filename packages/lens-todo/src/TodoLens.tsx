import { useState, type FormEvent } from 'react'
import { type LensProps, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { COURSES, HiddenElsewhere, Select, TextField } from '@pls/shared-ui'
import { Plus } from 'lucide-react'
import { doneToday, orderTodos } from './todo-items'
import { TodoRow } from './TodoRow'

/** Estimates offered when adding a to-do, in minutes. */
const ESTIMATES = [15, 20, 30, 45, 60, 90, 120]

export default function TodoLens({ scope, highlight, onScopeChange }: LensProps) {
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
  const hidden = <HiddenElsewhere scopedCount={open.length} unscopedCount={allOpen?.length ?? 0} />

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-widest text-neutral-600">
          {open.length > 0 ? `${open.length} to do` : 'To-do'}
        </span>
        {hidden}
      </div>

      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto" aria-label="To-dos">
        {open.map((item) => (
          <TodoRow
            key={item.occurrence_key}
            item={item}
            now={now}
            showCourse={!course}
            highlighted={!!highlight?.recordingId && item.source_id === highlight.recordingId}
            onToggle={() => complete.mutate(item.id)}
            onDismiss={() => dismiss.mutate(item.id)}
            onScopeChange={onScopeChange}
          />
        ))}
        {done.length > 0 && (
          <li className="pt-2 text-[10px] font-medium uppercase tracking-widest text-neutral-700">Done today</li>
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
          />
        ))}
        {!isLoading && open.length === 0 && done.length === 0 && (
          <li className="flex flex-1 items-center justify-center text-xs text-neutral-600">
            Nothing to do yet. Add something below.
          </li>
        )}
      </ul>

      <form onSubmit={submit} className="flex items-center gap-1.5">
        <TextField
          aria-label="New to-do"
          placeholder={courseLabel ? `Add a ${courseLabel} to-do` : 'Add a to-do'}
          value={title}
          maxLength={500}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Select
          aria-label="Time estimate"
          wrapperClassName="w-28 shrink-0"
          value={estimate}
          onChange={(e) => setEstimate(e.target.value)}
        >
          <option value="">No estimate</option>
          {ESTIMATES.map((min) => (
            <option key={min} value={min}>
              {min < 60 ? `${min} min` : `${min / 60} h`}
            </option>
          ))}
        </Select>
        <button
          type="submit"
          aria-label="Add to-do"
          title="Add to-do"
          disabled={!title.trim()}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent transition-colors hover:bg-accent/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  )
}
