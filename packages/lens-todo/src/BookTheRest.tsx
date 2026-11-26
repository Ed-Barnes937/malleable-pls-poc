import { useMemo, useState } from 'react'
import { DEFAULT_PREFERENCES, draftRest, formatMinutes, localDayRange, weekLayout, type PlanItemOccurrence } from '@pls/substrate'
import { useSubstrate, useSubstrateMutations, type DraftUndo } from '@pls/lens-framework'
import { clockTime, dayAndTime } from '@pls/shared-ui'
import { Loader2, Sparkles } from 'lucide-react'

const DAY_MS = 24 * 3_600_000

/**
 * Book the rest, from the To-do widget: the rest of a partly booked to-do
 * placed by the same planner as Auto-fill (inside study hours and the daily
 * budget, before it is due, split into sessions when no one block fits),
 * over the next seven days. A draft until the student says "Book it"; then
 * its blocks are saved together as sessions of the to-do, all or none, and
 * confirmed with Undo (an accepted draft, decision 19).
 */
export function BookTheRest({ todo, restMin, now, undo, onClose }: {
  todo: PlanItemOccurrence
  restMin: number
  now: number
  /** The widget's Undo for an accepted draft (see `useDraftUndo`). */
  undo: DraftUndo
  onClose: () => void
}) {
  const reader = useSubstrate()
  const bookSessions = useSubstrateMutations().useBookSessions()
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
      // As it was before, for Undo.
      const before = await undo.readBefore([todo.id])
      // In one go, on the server: all of them or none (and the to-do's own block, if it has one, becomes a session too).
      await bookSessions.mutateAsync({
        todoId: todo.id,
        blocks: blocks.map((b) => ({ starts_at: new Date(b.start).toISOString(), ends_at: new Date(b.end).toISOString() })),
      })
      if (before) {
        void undo.confirm({
          before,
          message: blocks.length === 1 ? `Booked the rest of "${todo.title}"` : `Booked the rest of "${todo.title}" in ${blocks.length} sessions`,
          failMessage: blocks.length === 1 ? "Couldn't take that session out of your plan." : "Couldn't take those sessions out of your plan.",
        })
      }
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
          No free time in the next week fits the other {formatMinutes(restMin)}{todo.due_at ? " before it's due" : ''}.
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
