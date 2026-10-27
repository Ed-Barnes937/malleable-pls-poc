import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { PlanItemKind, PlanItemOccurrence } from '@pls/substrate'
import { COURSES, Select, TextField, cn } from '@pls/shared-ui'
import { Check, Repeat, RotateCcw, Trash2, X } from 'lucide-react'
import { KIND_LABELS, validateDraft, type Draft } from './drafts'
import { fromInputs, formatDuration, toDateInput, toTimeInput } from './time'

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
  x, y, bounds, row, initial, canEdit, busy, error, children, onSubmit, onDelete, onToggleDone, onClose,
}: EventPopoverProps) {
  const ref = useRef<HTMLFormElement>(null)
  const [draft, setDraft] = useState<Draft>(initial)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pos, setPos] = useState({ left: x, top: y })
  const isCreate = !row
  const invalid = validateDraft(draft)
  const done = row?.status === 'done'

  useLayoutEffect(() => {
    const height = ref.current?.offsetHeight ?? 320
    const left = x + 12 + WIDTH > bounds.width ? x - WIDTH - 12 : x + 12
    setPos({
      left: Math.max(8, Math.min(left, bounds.width - WIDTH - 8)),
      top: Math.max(8, Math.min(y - 24, bounds.height - height - 8)),
    })
  }, [x, y, bounds.width, bounds.height])

  // One listener for the popover's lifetime: re-subscribing on every render
  // (onClose is often a fresh function) could drop an Escape mid-dispatch when
  // the shell's own Escape handling re-renders the board.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
  const fieldLabel = 'mb-1 block text-[10px] font-medium uppercase tracking-wider text-text-muted'

  return (
    <form
      ref={ref}
      role="dialog"
      aria-label={isCreate ? 'Add to calendar' : `Edit ${row.title}`}
      data-testid="calendar-popover"
      onSubmit={(e) => {
        e.preventDefault()
        if (!invalid && canEdit) onSubmit(draft)
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-50 flex flex-col gap-3 rounded-2xl border border-border bg-surface-raised p-3.5 shadow-[var(--shadow-panel-focused)]"
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
          className="border-transparent bg-transparent px-0 text-sm font-medium text-text-primary focus:border-transparent focus:ring-0"
        />
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="mt-1 rounded-md p-0.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isCreate ? (
        <div role="radiogroup" aria-label="Kind" className="grid grid-cols-3 gap-1 rounded-lg bg-surface-overlay/60 p-0.5">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={draft.kind === kind}
              onClick={() => set({ kind })}
              className={cn(
                'rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight transition-colors',
                draft.kind === kind ? 'bg-accent/15 text-accent ring-1 ring-accent/30' : 'text-text-secondary hover:text-text-primary',
              )}
            >
              {kind === 'commitment' ? 'Class / commitment' : KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      ) : (
        <span className="-mt-1 text-[10px] font-medium uppercase tracking-wider text-text-muted">
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
                To{length > 0 && <span className="ml-1 normal-case tracking-normal">· {formatDuration(length)}</span>}
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
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pb-1.5 text-[11px] text-text-secondary">
            <input
              type="checkbox"
              checked={draft.repeatsWeekly}
              disabled={!canEdit}
              onChange={(e) => set({ repeatsWeekly: e.target.checked })}
              className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            />
            <Repeat className="h-3 w-3" />
            Repeats weekly
          </label>
        )}
      </div>

      {children}

      {row?.recurrence && canEdit && (
        <p className="text-[10px] text-text-muted">Changes apply to every week.</p>
      )}
      {error && <p role="alert" className="text-[11px] text-tag-confused">{error}</p>}

      {canEdit && (
        <div className="flex items-center gap-1.5 border-t border-border-subtle pt-3">
          {onDelete && (confirmDelete ? (
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-tag-confused transition-colors hover:bg-tag-confused/10"
            >
              {row?.recurrence ? 'Delete every week?' : 'Delete it?'}
            </button>
          ) : (
            <button
              type="button"
              aria-label="Delete"
              title="Delete"
              onClick={() => setConfirmDelete(true)}
              className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          ))}
          {onToggleDone && (
            <button
              type="button"
              onClick={onToggleDone}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary"
            >
              {done ? <RotateCcw className="h-3 w-3" /> : <Check className="h-3 w-3" />}
              {done ? 'Not done yet' : 'Mark done'}
            </button>
          )}
          <button
            type="submit"
            disabled={!!invalid || busy}
            title={invalid ?? undefined}
            className="ml-auto rounded-lg bg-accent px-3 py-1 text-[11px] font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isCreate ? 'Add' : 'Save'}
          </button>
        </div>
      )}
    </form>
  )
}
