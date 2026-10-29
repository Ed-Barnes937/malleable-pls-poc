import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  DEFAULT_STUDY_HOURS,
  STUDY_PER_DAY_OPTIONS,
  WEEKDAYS,
  formatMinutes,
  sameStudyHours,
  sameStudyWindow,
  weekdayLabel,
  type StudyHours,
  type StudyWindow,
  type Weekday,
} from '@pls/substrate'
import { cn } from '@pls/shared-ui'
import { ChevronRight } from 'lucide-react'

/** What the editor saves: only what changed. */
export interface StudyRhythmChange {
  study_hours?: StudyHours
  study_min_per_day?: number
}

const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

const STEP_MIN = 30
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
/** Every half hour; a start runs 00:00-23:30, an end 00:30-24:00. */
const START_TIMES = Array.from({ length: 24 * 60 / STEP_MIN }, (_, i) => hhmm(i * STEP_MIN))
const END_TIMES = Array.from({ length: 24 * 60 / STEP_MIN }, (_, i) => hhmm((i + 1) * STEP_MIN))
/** The half-hour choices, plus `value` if it is between them (set some other way). */
const withValue = (times: string[], value: string) => (times.includes(value) ? times : [...times, value].sort())

/** Zero-padded "HH:MM" compares as text; no overnight windows. */
const endsAfterStart = (w: StudyWindow) => w.end > w.start

export const END_BEFORE_START = 'End time must be after the start time.'
export const REPLACES_DAYS = 'Saving uses these times for every day, replacing the times you set for each day.'

/** Every day has study, all at the same times. */
const everyDaySame = (h: StudyHours) => WEEKDAYS.every((d) => h[d] && sameStudyWindow(h[d], h.mon))

const popoverWidth = 320
const margin = 8

/**
 * "When do you study?": study hours as one range for every day, or a range
 * per day (any day can be "No study") under "Different on some days", and
 * study time per day. Nothing is saved until Save. A popover beside its
 * `anchor` (the line's Change button), sized to fit a phone: focus moves in
 * when it opens, stays inside while it is open, and goes back to the anchor
 * when it closes (Save, Cancel, Escape or a press outside).
 */
export function StudyHoursEditor({ anchor, studyHours, studyMinPerDay, onSave, onClose }: {
  anchor: RefObject<HTMLElement | null>
  studyHours: StudyHours
  studyMinPerDay: number
  onSave: (change: StudyRhythmChange) => void
  onClose: () => void
}) {
  const studying = WEEKDAYS.map((d) => studyHours[d]).filter((w): w is StudyWindow => !!w)
  const uniform = everyDaySame(studyHours)
  const [perDay, setPerDay] = useState(studyMinPerDay)
  const [different, setDifferent] = useState(!uniform)
  const [every, setEvery] = useState<StudyWindow>(studying[0] ?? DEFAULT_STUDY_HOURS.mon!)
  const [days, setDays] = useState<StudyHours>(studyHours)
  // A day was edited in "Different on some days" (and not saved yet).
  const [touched, setTouched] = useState(false)
  const editDay = (day: Weekday, w: StudyWindow | null) => {
    setDays({ ...days, [day]: w })
    setTouched(true)
  }

  const headingId = useId()
  const daysId = useId()
  const noteId = useId()
  const ref = useRef<HTMLDivElement>(null)
  const firstFieldRef = useRef<HTMLSelectElement>(null)

  const close = () => {
    onClose()
    requestAnimationFrame(() => {
      if (anchor.current?.isConnected) anchor.current.focus()
    })
  }

  const everyHours = Object.fromEntries(WEEKDAYS.map((d) => [d, every])) as StudyHours
  const hours: StudyHours = different ? days : everyHours
  // Collapsed, Save gives every day the "Every day" times: say so when that
  // replaces per-day times the student set (saved ones that differ, or edits)
  // with something else.
  const replacesDays = !different && (touched || !uniform) && !sameStudyHours(days, everyHours)
  // Days (or "every") whose end is not after their start: shown as you go, and Save waits for them.
  const invalid: string[] = different
    ? WEEKDAYS.filter((d) => days[d] && !endsAfterStart(days[d]!))
    : endsAfterStart(every) ? [] : ['every']

  const save = () => {
    if (invalid.length > 0) {
      ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      return
    }
    const change: StudyRhythmChange = {}
    if (!sameStudyHours(hours, studyHours)) change.study_hours = hours
    if (perDay !== studyMinPerDay) change.study_min_per_day = perDay
    if (Object.keys(change).length > 0) onSave(change)
    close()
  }

  const openDifferent = () => {
    // Starts from what "Every day" says, unless the days differ or were
    // edited (closing and opening again never loses an edit).
    if (!different && !touched && everyDaySame(days)) setDays(everyHours)
    setDifferent(!different)
  }

  // Focus goes to the first time when it opens (the first field if that day is "No study").
  useEffect(() => {
    const first = firstFieldRef.current
    if (first && !first.disabled) first.focus()
    else ref.current?.querySelector<HTMLElement>('select:not(:disabled), input, button')?.focus()
  }, [])

  // Beside the anchor: below it, else above, inside the window.
  const [pos, setPos] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null)
  useLayoutEffect(() => {
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const el = ref.current
      if (!a || !el) return
      const width = Math.min(popoverWidth, window.innerWidth - 2 * margin)
      const left = Math.min(Math.max(margin, a.right - width), window.innerWidth - width - margin)
      const maxHeight = window.innerHeight - 2 * margin
      const height = Math.min(el.scrollHeight, maxHeight)
      const below = a.bottom + 6
      const top = below + height <= window.innerHeight - margin ? below : Math.max(margin, Math.min(a.top - 6 - height, window.innerHeight - margin - height))
      setPos((p) => (p && p.left === left && p.top === top && p.width === width && p.maxHeight === maxHeight ? p : { left, top, width, maxHeight }))
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    const observer = new ResizeObserver(place)
    if (ref.current) observer.observe(ref.current)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
      observer.disconnect()
    }
    // Placed again, before paint, when the days open or close (it grows or shrinks).
  }, [anchor, different])

  // A press outside (not on the anchor, which toggles it) cancels.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || anchor.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [anchor, onClose])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key !== 'Tab') return
    // Tab stays inside while it is open.
    const fields = [...(ref.current?.querySelectorAll<HTMLElement>('select, input, button') ?? [])].filter((f) => !f.hasAttribute('disabled'))
    const first = fields[0]
    const last = fields[fields.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last?.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first?.focus()
    }
  }

  const perDayOptions = useMemo(
    () => ((STUDY_PER_DAY_OPTIONS as readonly number[]).includes(studyMinPerDay)
      ? [...STUDY_PER_DAY_OPTIONS]
      : [...STUDY_PER_DAY_OPTIONS, studyMinPerDay].sort((a, b) => a - b)),
    [studyMinPerDay],
  )

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-testid="study-hours-editor"
      onKeyDown={onKeyDown}
      // Presses inside never reach the board or the grid behind.
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed z-50 flex flex-col gap-3 overflow-y-auto rounded-widget border border-border-subtle bg-surface-raised p-4 text-body text-text-primary shadow-pop"
      style={pos ? { left: pos.left, top: pos.top, width: pos.width, maxHeight: pos.maxHeight } : { left: 0, top: 0, width: popoverWidth, opacity: 0 }}
    >
      <h4 id={headingId} className="text-title font-semibold">When do you study?</h4>

      {!different && (
        <TimeRange
          label="Every day"
          labelClassName="w-[4.5rem]"
          name="every day"
          window={every}
          onChange={setEvery}
          invalid={invalid.length > 0}
          startRef={firstFieldRef}
        />
      )}
      {/* Always rendered (taking no room while empty), so a note that appears is announced. */}
      <div aria-live="polite" className="-mt-3">
        {replacesDays && (
          <p id={noteId} data-testid="study-hours-note" className="mt-1 text-meta text-text-secondary">
            {REPLACES_DAYS}
          </p>
        )}
      </div>

      <label className="flex items-center justify-between gap-2 text-meta text-text-secondary">
        Study time per day
        <select
          value={perDay}
          onChange={(e) => setPerDay(Number(e.target.value))}
          className={selectClass}
        >
          {perDayOptions.map((min) => <option key={min} value={min}>{formatMinutes(min)}</option>)}
        </select>
      </label>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-expanded={different}
          aria-controls={daysId}
          onClick={openDifferent}
          className="inline-flex items-center gap-1 self-start rounded-item text-meta font-semibold text-accent hover:underline"
        >
          <ChevronRight className={cn('h-3.5 w-3.5 transition-transform motion-reduce:transition-none', different && 'rotate-90')} aria-hidden />
          Different on some days
        </button>
        {different && (
          <ul id={daysId} className="flex flex-col gap-1.5">
            {WEEKDAYS.map((d, i) => {
              const w = days[d]
              return (
                <li key={d}>
                  <TimeRange
                    label={weekdayLabel(d)}
                    labelClassName="w-8"
                    name={DAY_NAMES[d]}
                    window={w ?? every}
                    off={!w}
                    onChange={(next) => editDay(d, next)}
                    onOffChange={(off) => editDay(d, off ? null : every)}
                    invalid={invalid.includes(d)}
                    startRef={i === 0 ? firstFieldRef : undefined}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={close} className="inline-flex h-9 items-center rounded-control px-3 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary">
          Cancel
        </button>
        <button type="button" onClick={save} aria-describedby={replacesDays ? noteId : undefined} className="inline-flex h-9 items-center rounded-control bg-accent px-4 text-body font-semibold text-accent-foreground transition-opacity hover:opacity-90">
          Save
        </button>
      </div>
    </div>,
    document.body,
  )
}

const selectClass = 'h-8 min-w-0 rounded-item border border-border bg-surface-inset px-1.5 text-meta font-semibold text-text-primary disabled:opacity-50 aria-[invalid=true]:border-attn-line'

/** "[label] [start] to [end]", with "No study" when `onOffChange` is given, and the error under it. */
function TimeRange({ label, labelClassName, name, window: w, off = false, onChange, onOffChange, invalid, startRef }: {
  label: string
  labelClassName: string
  /** For the accessible names: "Monday", "every day". */
  name: string
  window: StudyWindow
  off?: boolean
  onChange: (next: StudyWindow) => void
  onOffChange?: (off: boolean) => void
  invalid: boolean
  startRef?: RefObject<HTMLSelectElement | null>
}) {
  const errorId = useId()
  const error = invalid && !off
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-meta text-text-secondary">
        <span aria-hidden className={cn('shrink-0 font-medium', labelClassName, off && 'text-text-muted')}>{label}</span>
        <select
          ref={startRef}
          aria-label={`Start time, ${name}`}
          value={w.start}
          disabled={off}
          onChange={(e) => onChange({ ...w, start: e.target.value })}
          className={cn(selectClass, 'flex-1')}
        >
          {withValue(START_TIMES, w.start).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <span aria-hidden className={cn(off && 'text-text-muted')}>to</span>
        <select
          aria-label={`End time, ${name}`}
          aria-invalid={error || undefined}
          aria-describedby={error ? errorId : undefined}
          value={w.end}
          disabled={off}
          onChange={(e) => onChange({ ...w, end: e.target.value })}
          className={cn(selectClass, 'flex-1')}
        >
          {withValue(END_TIMES, w.end).map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        {onOffChange && (
          <label className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <input
              type="checkbox"
              checked={off}
              aria-label={`No study on ${name}`}
              onChange={(e) => onOffChange(e.target.checked)}
              className="h-3.5 w-3.5 accent-accent"
            />
            No study
          </label>
        )}
      </div>
      {error && (
        <p id={errorId} data-testid="study-hours-error" className="text-meta text-attn">
          {END_BEFORE_START}
        </p>
      )}
    </div>
  )
}
