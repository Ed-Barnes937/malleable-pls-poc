import { useId, useMemo, useRef, useState } from 'react'
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
import { PopoverContent, PopoverTitle, TimeInput, cn } from '@pls/shared-ui'
import { ChevronRight } from 'lucide-react'

/** What the editor saves: only what changed. */
export interface StudyRhythmChange {
  study_hours?: StudyHours
  study_min_per_day?: number
}

const DAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday',
}

/** ArrowUp / ArrowDown on a minute move it by half an hour, as the choices did before. */
const STEP_MIN = 30
/**
 * The end of the day. A time field can't show 24:00, so an end of 00:00
 * means midnight at the end of the day (no window runs overnight, so it can
 * mean nothing else).
 */
const END_OF_DAY = '24:00'
const endShown = (end: string) => (end === END_OF_DAY ? '00:00' : end)
const endSaved = (end: string) => (end === '00:00' ? END_OF_DAY : end)

/** Zero-padded "HH:MM" compares as text; no overnight windows. */
const endsAfterStart = (w: StudyWindow) => w.end > w.start

export const END_BEFORE_START = 'End time must be after the start time.'
export const REPLACES_DAYS = 'Saving uses these times for every day, replacing the times you set for each day.'

/** Every day has study, all at the same times. */
const everyDaySame = (h: StudyHours) => WEEKDAYS.every((d) => h[d] && sameStudyWindow(h[d], h.mon))

/**
 * "When do you study?": study hours as one range for every day, or a range
 * per day (any day can be "No study") under "Different on some days", and
 * study time per day. Nothing is saved until Save.
 *
 * The content of a shared-ui `Popover` (UI SDK) whose trigger is the line's
 * Change button, opened with `modal="trap-focus"`: below the button (or
 * above it), inside the window and sized to fit a phone. Focus moves in when
 * it opens, stays inside while it is open, and goes back to Change when it
 * closes (Save, Cancel, Escape or a press outside). It starts afresh each
 * time it opens.
 */
export function StudyHoursEditor(props: {
  studyHours: StudyHours
  studyMinPerDay: number
  onSave: (change: StudyRhythmChange) => void
  /** Save or Cancel: close it. */
  onDone: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <PopoverContent
      ref={ref}
      side="bottom"
      align="end"
      sideOffset={6}
      // The first time (the first field if that day is "No study").
      initialFocus={() =>
        ref.current?.querySelector<HTMLElement>('[data-first-time] input:not(:disabled)')
        ?? ref.current?.querySelector<HTMLElement>('select:not(:disabled), input:not(:disabled), button')}
      data-testid="study-hours-editor"
      // Presses inside never reach the board or the grid behind.
      onPointerDown={(e) => e.stopPropagation()}
      className="w-80 max-w-[calc(100vw-16px)] gap-3 text-body"
    >
      <StudyHoursForm {...props} container={ref} />
    </PopoverContent>
  )
}

function StudyHoursForm({ studyHours, studyMinPerDay, onSave, onDone, container }: {
  studyHours: StudyHours
  studyMinPerDay: number
  onSave: (change: StudyRhythmChange) => void
  onDone: () => void
  container: { current: HTMLElement | null }
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

  const daysId = useId()
  const noteId = useId()

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
      container.current?.querySelector<HTMLElement>('[aria-invalid="true"] input')?.focus()
      return
    }
    const change: StudyRhythmChange = {}
    if (!sameStudyHours(hours, studyHours)) change.study_hours = hours
    if (perDay !== studyMinPerDay) change.study_min_per_day = perDay
    if (Object.keys(change).length > 0) onSave(change)
    onDone()
  }

  const openDifferent = () => {
    // Starts from what "Every day" says, unless the days differ or were
    // edited (closing and opening again never loses an edit).
    if (!different && !touched && everyDaySame(days)) setDays(everyHours)
    setDifferent(!different)
  }

  const perDayOptions = useMemo(
    () => ((STUDY_PER_DAY_OPTIONS as readonly number[]).includes(studyMinPerDay)
      ? [...STUDY_PER_DAY_OPTIONS]
      : [...STUDY_PER_DAY_OPTIONS, studyMinPerDay].sort((a, b) => a - b)),
    [studyMinPerDay],
  )

  return (
    <>
      <PopoverTitle className="text-title">When do you study?</PopoverTitle>

      {!different && (
        <TimeRange
          label="Every day"
          labelClassName="w-[4.5rem]"
          name="every day"
          window={every}
          onChange={setEvery}
          invalid={invalid.length > 0}
          first
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
                    first={i === 0}
                  />
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onDone} className="inline-flex h-9 items-center rounded-control px-3 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary">
          Cancel
        </button>
        <button type="button" onClick={save} aria-describedby={replacesDays ? noteId : undefined} className="inline-flex h-9 items-center rounded-control bg-accent px-4 text-body font-semibold text-accent-foreground transition-opacity hover:opacity-90">
          Save
        </button>
      </div>
    </>
  )
}

const selectClass = 'h-8 min-w-0 rounded-item border border-border bg-surface-inset px-1.5 text-meta font-semibold text-text-primary disabled:opacity-50 aria-[invalid=true]:border-attn-line'

/** "[label] [start] to [end]", with "No study" when `onOffChange` is given, and the error under it. */
function TimeRange({ label, labelClassName, name, window: w, off = false, onChange, onOffChange, invalid, first = false }: {
  label: string
  labelClassName: string
  /** For the accessible names: "Monday", "every day". */
  name: string
  window: StudyWindow
  off?: boolean
  onChange: (next: StudyWindow) => void
  onOffChange?: (off: boolean) => void
  invalid: boolean
  /** The first range: focus starts on its start time. */
  first?: boolean
}) {
  const errorId = useId()
  const error = invalid && !off
  const field = 'min-w-0 flex-1 [&_[data-slot=time-input]]:h-8 [&_[data-slot=time-input]]:px-1.5 [&_[data-slot=time-input]]:text-meta [&_[data-slot=time-input]]:font-semibold'
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-meta text-text-secondary">
        <span aria-hidden className={cn('shrink-0 font-medium', labelClassName, off && 'text-text-muted')}>{label}</span>
        <span data-first-time={first || undefined} className="contents">
          <TimeInput
            label={`Start time, ${name}`}
            value={w.start}
            step={STEP_MIN}
            hourCycle={24}
            disabled={off}
            onValueChange={(v) => v && onChange({ ...w, start: v })}
            className={field}
          />
        </span>
        <span aria-hidden className={cn(off && 'text-text-muted')}>to</span>
        <TimeInput
          label={`End time, ${name}`}
          value={endShown(w.end)}
          step={STEP_MIN}
          hourCycle={24}
          disabled={off}
          invalid={error}
          describedBy={error ? errorId : undefined}
          onValueChange={(v) => v && onChange({ ...w, end: endSaved(v) })}
          className={field}
        />
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
