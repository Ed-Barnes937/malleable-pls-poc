import { useRef, useState, type ReactNode } from 'react'
import type { PlanItemKind, PlanItemOccurrence } from '@pls/substrate'
import { COURSES, Select, TextField, cn } from '@pls/shared-ui'
import { Check, Loader2, Repeat, RotateCcw, Trash2, X } from 'lucide-react'
import { KIND_LABELS, validateDraft, type Draft } from './drafts'
import { fromInputs, formatDuration, toDateInput, toTimeInput } from './time'
import { useEscapeToClose, usePopoverPosition } from './popover-position'
import { PendingStatus, pendingLabel, pendingProps, type PendingAction } from './pending'

export interface EventPopoverProps {
  /** Position relative to the calendar root. */
  x: number
  y: number
  /** Bounds to stay inside. */
  bounds: { width: number; height: number }
  /** Absent when creating. */
  row?: PlanItemOccurrence
  initial: Draft
  /** Can this widget write? Read-only hosts get a view-only popover. */
  canEdit: boolean
  busy?: boolean
  /** The action this popover is waiting on, named on its button while it saves. */
  pending?: PendingAction | null
  error?: string | null
  /** Shown between the form and the actions, e.g. the lecture moment. */
  children?: ReactNode
  onSubmit: (draft: Draft) => void
  onDelete?: () => void
  onToggleDone?: () => void
  onClose: () => void
}

const WIDTH = 300
const KINDS: PlanItemKind[] = ['commitment', 'task', 'deadline']

/** Create / edit card for a calendar item, anchored where the student clicked. */
export function EventPopover({
  x, y, bounds, row, initial, canEdit, busy, pending, error, children, onSubmit, onDelete, onToggleDone, onClose,
}: EventPopoverProps) {
  const ref = useRef<HTMLFormElement>(null)
  const [draft, setDraft] = useState<Draft>(initial)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const pos = usePopoverPosition(ref, { x, y, bounds, width: WIDTH })
  const isCreate = !row
  const invalid = validateDraft(draft)
  const done = row?.status === 'done'

  useEscapeToClose(onClose)

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }))
  const setDate = (value: string) => {
    const start = fromInputs(value, toTimeInput(draft.start))
    const end = fromInputs(value, toTimeInput(draft.end))
    if (start && end) set({ start, end })
  }
  const setTime = (which: 'start' | 'end', value: string) => {
    const next = fromInputs(toDateInput(draft.start), value)
    if (!next) return
    if (which === 'end') return set({ end: next })
    // Moving the start keeps the length, like dragging would.
    const length = draft.end.getTime() - draft.start.getTime()
    set({ start: next, end: new Date(next.getTime() + length) })
  }

  const isDue = draft.kind === 'deadline'
  const length = Math.round((draft.end.getTime() - draft.start.getTime()) / 60_000)
  const fieldLabel = 'mb-1 block text-meta font-semibold text-text-muted'

  return (
    <form
      ref={ref}
      role="dialog"
      aria-label={isCreate ? 'Add to calendar' : `Edit ${row.title}`}
      data-testid="calendar-popover"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid && canEdit && !busy) onSubmit(draft)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-50 flex flex-col gap-3 rounded-widget border border-border-subtle bg-surface-raised p-4 shadow-pop"
      style={{ left: pos.left, top: pos.top, width: WIDTH }}
    >
      <div className="flex items-start gap-2">
        <TextField
          // Focus moves into the popover however it was opened (click or Enter).
          autoFocus
          aria-label="Title"
          placeholder={isDue ? "What's due?" : 'What is it?'}
          value={draft.title}
          disabled={!canEdit}
          onChange={(e) => set({ title: e.target.value })}
          className="border-transparent bg-transparent px-0 text-title font-semibold text-text-primary focus:border-transparent focus:ring-0"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-item text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {isCreate ? (
        <div role="radiogroup" aria-label="Kind" className="grid grid-cols-3 gap-1 rounded-control bg-surface-overlay p-[3px]">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind}
              onClick={() => set({ kind })}
              className={cn(
                'rounded-item px-1.5 py-1.5 text-meta leading-tight transition-colors',
                draft.kind === kind ? 'bg-surface-raised font-semibold text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {kind === 'commitment' ? 'Class / commitment' : KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      ) : (
        <span className="-mt-1 text-meta font-semibold text-text-muted">
          {row.kind === 'commitment' ? (row.subtype ?? 'Fixed commitment') : KIND_LABELS[row.kind]}
          {row.kind === 'commitment' && ' · stays where it is unless you edit it'}
        </span>
      )}

      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <label className={cn('min-w-0', !isDue && 'col-span-2')}>
            <span className={fieldLabel}>{isDue ? 'Due' : 'Day'}</span>
            <TextField type="date" aria-label="Date" value={toDateInput(draft.start)} disabled={!canEdit} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="min-w-0">
            <span className={fieldLabel}>{isDue ? 'At' : 'From'}</span>
            <TextField type="time" aria-label={isDue ? 'Due time' : 'Start time'} step={900} value={toTimeInput(draft.start)} disabled={!canEdit} onChange={(e) => setTime('start', e.target.value)} />
          </label>
          {!isDue && (
            <label className="min-w-0">
              <span className={fieldLabel}>
                To{length > 0 && <span className="ml-1 font-normal">· {formatDuration(length)}</span>}
              </span>
              <TextField type="time" aria-label="End time" step={900} value={toTimeInput(draft.end)} disabled={!canEdit} onChange={(e) => setTime('end', e.target.value)} />
            </label>
          )}
        </div>
      </div>

      <div className="flex items-end gap-2">
        <label className="min-w-0 flex-1">
          <span className={fieldLabel}>Course</span>
          <Select aria-label="Course" value={draft.course ?? ''} disabled={!canEdit} onChange={(e) => set({ course: e.target.value || null })}>
            <option value="">No course</option>
            {COURSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </label>
        {draft.kind === 'commitment' && (
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pb-2 text-body text-text-secondary">
            <input
              type="checkbox"
              checked={draft.repeatsWeekly}
              disabled={!canEdit}
              onChange={(e) => set({ repeatsWeekly: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <Repeat className="h-3.5 w-3.5" />
            Repeats weekly
          </label>
        )}
      </div>

      {children}

      {row?.recurrence && canEdit && (
        <p className="text-meta text-text-muted">Changes apply to every week.</p>
      )}
      {error && <p role="alert" className="text-meta text-confused">{error}</p>}
      <PendingStatus pending={pending} done={done} />

      {canEdit && (
        <div className="flex items-center gap-1.5 border-t border-border-subtle pt-3">
          {onDelete && (confirmDelete ? (
            <button
              type="button"
              {...pendingProps(busy, pending === 'delete', onDelete)}
              className="inline-flex h-9 items-center gap-2 rounded-control px-3.5 text-body font-medium transition-colors text-confused hover:bg-confused-soft"
            >
              {pending === 'delete' && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
              {pending === 'delete' ? pendingLabel('delete') : row?.recurrence ? 'Delete every week?' : 'Delete it?'}
            </button>
          ) : (
            <button
              type="button"
              aria-label="Delete"
              title="Delete"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-control text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ))}
          {onToggleDone && (
            <button
              type="button"
              {...pendingProps(busy, pending === 'done', onToggleDone)}
              className="inline-flex h-9 items-center gap-2 rounded-control px-3.5 text-body font-medium transition-colors border border-border bg-surface-raised text-text-primary hover:bg-surface-overlay"
            >
              {pending === 'done' ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : done ? <RotateCcw className="h-4 w-4" /> : <Check className="h-4 w-4" />}
              {pending === 'done' ? pendingLabel('done', done) : done ? 'Not done yet' : 'Mark done'}
            </button>
          )}
          <button
            type="submit"
            {...pendingProps(busy, pending === 'add' || pending === 'save')}
            disabled={!!invalid || (busy && pending !== 'add' && pending !== 'save')}
            title={invalid ?? undefined}
            className="ml-auto inline-flex h-9 items-center gap-2 rounded-control bg-accent px-3.5 text-body font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {(pending === 'add' || pending === 'save') && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            {pending === 'add' || pending === 'save' ? pendingLabel(pending) : isCreate ? 'Add' : 'Save'}
          </button>
        </div>
      )}
    </form>
  )
}
