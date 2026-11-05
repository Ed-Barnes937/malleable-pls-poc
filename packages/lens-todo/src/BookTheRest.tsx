import { useMemo, useState } from 'react'
import { DEFAULT_PREFERENCES, draftRest, formatMinutes, localDayRange, newSession, weekLayout, type PlanItemOccurrence } from '@pls/substrate'
import { useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { clockTime, dayAndTime } from '@pls/shared-ui'
import { Loader2, Sparkles } from 'lucide-react'

const DAY_MS = 24 * 3_600_000

/**
 * Book the rest, from the To-do widget: the rest of a partly booked to-do
 * placed by the same planner as Auto-fill (inside study hours and the daily
 * budget, before it is due, split into sessions when no one block fits),
 * over the next seven days. A draft until the student says "Book it"; then
 * each block is saved as a session of the to-do.
 */
export function BookTheRest({ todo, restMin, now, onClose }: {
  todo: PlanItemOccurrence
  restMin: number
  now: number
  onClose: () => void
}) {
  const reader = useSubstrate()
  const create = useSubstrateMutations().useCreatePlanItem()
  const preferences = reader.usePreferences()
  const prefs = preferences.data ?? (preferences.error ? DEFAULT_PREFERENCES : undefined)
  const timeZone = prefs?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const [asked] = useState(now)
  const week = useMemo(() => {
    const start = localDayRange(asked, timeZone).start
    return { start, end: start + 7 * DAY_MS }
  }, [asked, timeZone])
  // Every course: scope never changes what is busy.
  const { data: rows } = reader.usePlanItems({ from: new Date(week.start).toISOString(), to: new Date(week.end).toISOString(), statuses: ['open', 'done'] })
  // Worked out once, so the draft doesn't shift under the student as rows refresh.
  const [frozen, setFrozen] = useState<{ start: number; end: number }[] | null>(null)
  const computed = useMemo(() => {
    if (!rows || !prefs) return null
    const layout = weekLayout(rows, week, { timeZone, studyHours: prefs.study_hours, studyMinPerDay: prefs.study_min_per_day })
    return draftRest(todo, restMin, layout, asked).placements.map((p) => ({ start: p.start, end: p.end }))
  }, [rows, prefs, week, timeZone, todo, restMin, asked])
  if (computed && !frozen) setFrozen(computed)
  const blocks = frozen

  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const book = async () => {
    if (!blocks || saving) return
    setSaving(true)
    setFailed(false)
    try {
      // One at a time: the first turns the to-do's own block, if it has one, into a session too.
      for (const b of blocks) await create.mutateAsync(newSession(todo, new Date(b.start).toISOString(), new Date(b.end).toISOString()))
      onClose()
    } catch {
      setFailed(true)
      setSaving(false)
    }
  }

  return (
    <div data-testid="book-the-rest" className="flex flex-col gap-2 rounded-item border border-dashed border-accent-line bg-accent-soft px-3 py-2.5">
      {!blocks ? (
        <p className="text-meta text-text-muted">Finding time for the other {formatMinutes(restMin)}...</p>
      ) : blocks.length === 0 ? (
        <p className="text-meta text-text-secondary">
          No free time in the next week fits the other {formatMinutes(restMin)} before it's due.
        </p>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-meta font-semibold text-accent">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {blocks.length === 1 ? `Suggested time for the other ${formatMinutes(restMin)}` : `Suggested times for the other ${formatMinutes(restMin)}`}
          </p>
          <ul className="flex flex-col gap-1">
            {blocks.map((b) => (
              <li key={b.start} data-testid="book-the-rest-block" className="text-body tabular-nums text-text-primary">
                {dayAndTime(b.start, asked)} - {clockTime(b.end)}
              </li>
            ))}
          </ul>
        </>
      )}
      {failed && <p role="status" className="text-meta text-text-secondary">Couldn't book it just now. Nothing changed - try again?</p>}
      <div className="flex flex-wrap gap-1.5">
        {blocks && blocks.length > 0 && (
          <button
            type="button"
            onClick={() => void book()}
            aria-busy={saving || undefined}
            className="inline-flex h-8 items-center gap-1.5 rounded-item bg-accent px-2.5 text-body font-semibold text-accent-foreground transition-opacity hover:opacity-90"
          >
            {saving && <Loader2 aria-hidden className="h-4 w-4 animate-spin" />}
            {saving ? 'Booking...' : 'Book it'}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="inline-flex h-8 items-center rounded-item px-2 text-body font-medium text-text-secondary transition-colors hover:bg-surface-overlay hover:text-text-primary disabled:opacity-50"
        >
          {blocks && blocks.length > 0 ? 'Not now' : 'Close'}
        </button>
      </div>
    </div>
  )
}
