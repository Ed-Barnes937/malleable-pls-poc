import { useEffect, useState } from 'react'
import type { RefitProposal } from '@pls/substrate'
import { isConflictError, missedQuestion, movedNote, movedPastThisWeek, noFitLabel, refitAsk, useMissedBlocks, type LensProps, type PlanItemRef } from '@pls/lens-framework'
import { cn, dayAndTime } from '@pls/shared-ui'
import { CalendarClock, RotateCcw, X } from 'lucide-react'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

type Step = 'ask' | 'preview' | 'saving'
type Problem = 'conflict' | 'failed' | null

/**
 * "2 blocks didn't happen. Re-fit them?": study blocks whose time passed
 * without being ticked off, re-placed in free time on request. Calm by
 * design: a gentle question, a preview of the new times, and "Not now" /
 * "Keep my plan", after which those blocks aren't raised again (only a newly
 * missed block brings the question back; answers are shared with the
 * Calendar, see `useMissedBlocks`). Commitments are never involved.
 * On a course board, only that course's blocks.
 */
export function RefitBanner({ course, onShowPlanItem }: {
  course: string | undefined
  /** Shows a block on the board's calendar, when it has one (see `LensProps`). */
  onShowPlanItem?: LensProps['onShowPlanItem']
}) {
  const missed = useMissedBlocks({ course })

  const [step, setStep] = useState<Step>('ask')
  const [problem, setProblem] = useState<Problem>(null)
  /**
   * What happened, and, when blocks went past this week (which the calendar
   * opens on), a way to show the first of them.
   */
  const [note, setNote] = useState<{ text: string; show: PlanItemRef & { label: string } | null } | null>(null)

  // Blocks the student already answered for (here or in another widget) are left out.
  const proposals = missed.proposals
  const fits = proposals.filter((p) => p.starts_at && p.ends_at)
  const open = proposals.length > 0

  // Once nothing is left to ask about, the next miss starts with the question.
  // A new question replaces any note from an earlier re-fit, so an old note
  // (and its action) can't come back once that question is answered elsewhere.
  const { endPreview } = missed
  useEffect(() => {
    if (open) {
      setNote(null)
    } else {
      setStep('ask')
      setProblem(null)
      endPreview()
    }
  }, [open, endPreview])

  // The action needs a calendar on the board to show the blocks in.
  const show = note && onShowPlanItem ? note.show : null

  // A short "done" line, then nothing; one with a way to see the blocks
  // stays until it is used or dismissed (no time limit on an action).
  useEffect(() => {
    if (!note || show) return
    const t = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(t)
  }, [note, show])

  const markHandled = (ps: RefitProposal[]) => missed.markHandled(ps)

  if (!open) {
    if (!note) return null
    const text = (
      <p role="status" data-testid="refit-note" className="min-w-0 flex-1 px-1 text-meta text-text-muted">
        {note.text}
        {show && (
          <>
            {' '}
            <button
              type="button"
              onClick={() => {
                onShowPlanItem?.({ id: show.id, startsAt: show.startsAt })
                setNote(null)
              }}
              className="rounded-item font-semibold text-accent outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent"
            >
              {show.label}
            </button>
          </>
        )}
      </p>
    )
    if (!show) return text
    return (
      <div className="flex items-start gap-1">
        {text}
        <button
          type="button"
          aria-label="Dismiss"
          title="Dismiss"
          onClick={() => setNote(null)}
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-item text-text-muted outline-none transition-colors hover:bg-surface-overlay hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    )
  }

  const n = proposals.length

  const moveThem = () => {
    const noFit = proposals.filter((p) => !p.starts_at || !p.ends_at)
    setStep('saving')
    setProblem(null)
    missed.accept(fits.map((p) => ({ id: p.item.id, starts_at: p.starts_at!, ends_at: p.ends_at! }))).then(
      () => {
        // Shown once here, so they don't bring the question straight back.
        markHandled(noFit)
        // The move is atomic: every block with a new time moved.
        const moved = fits.map((p) => ({ id: p.item.id, startsAt: p.starts_at! }))
        const later = onShowPlanItem ? movedPastThisWeek(moved) : null
        setNote({
          text: movedNote(moved.map((b) => b.startsAt), noFit),
          show: later,
        })
      },
      (err: unknown) => {
        // A conflict refreshes the preview (the mutation invalidates it); show that one.
        setStep('preview')
        setProblem(isConflictError(err) ? 'conflict' : 'failed')
      },
    )
  }

  const keepPlan = () => {
    markHandled(proposals)
    missed.endPreview()
    setNote(null)
  }

  // The Calendar stops asking about these while their new times show here.
  const showTimes = () => {
    missed.startPreview(proposals)
    setStep('preview')
  }

  const question = missedQuestion(n)

  return (
    <section
      data-testid="refit-banner"
      aria-label="Blocks that didn't happen"
      className="flex flex-col gap-2.5 rounded-item border border-attn-line bg-attn-soft px-3 py-2.5"
    >
      <div className="flex items-start gap-2">
        <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-attn" />
        <p className="flex-1 text-body text-text-primary">
          {question}{' '}
          {step === 'ask'
            ? refitAsk(n)
            : fits.length > 0
              ? plural(fits.length, 'Here is where it could go:', 'Here is where they could go:')
              : plural(n, 'There is no free time for it right now.', 'There is no free time for them right now.')}
        </p>
      </div>

      {step !== 'ask' && (
        <ul className="flex flex-col gap-1.5 pl-6" aria-label="New times">
          {proposals.map((p) => (
            <li key={p.item.id} data-testid="refit-proposal" className="flex flex-col text-meta">
              <span className="truncate font-semibold text-text-primary">{p.item.title}</span>
              {p.starts_at ? (
                <span className="flex items-center gap-1 tabular-nums text-text-secondary">
                  <CalendarClock className="h-3 w-3" />
                  {dayAndTime(p.starts_at)}
                </span>
              ) : (
                <span className="text-text-secondary">{noFitLabel(p)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {problem && step === 'preview' && (
        <p role="status" className="pl-6 text-meta text-text-secondary">
          {problem === 'failed'
            ? "Couldn't move them just now. Try again in a moment."
            : fits.length > 0 ? 'Your week changed, so here are fresh times.' : 'Your week changed.'}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 pl-6">
        {step === 'ask' ? (
          <>
            <button type="button" onClick={showTimes} className={primary}>Re-fit</button>
            <button type="button" onClick={keepPlan} className={secondary}>Not now</button>
          </>
        ) : (
          <>
            {fits.length > 0 && (
              <button type="button" onClick={moveThem} disabled={step === 'saving'} className={primary}>
                {step === 'saving' ? 'Moving...' : problem === 'failed' ? 'Try again' : plural(fits.length, 'Move it', 'Move them')}
              </button>
            )}
            <button type="button" onClick={keepPlan} disabled={step === 'saving'} className={secondary}>
              Keep my plan
            </button>
          </>
        )}
      </div>
    </section>
  )
}

const button = 'inline-flex h-8 items-center rounded-item px-3 text-body font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const primary = cn(button, 'bg-accent text-accent-foreground hover:opacity-90')
const secondary = cn(button, 'text-text-secondary hover:bg-surface-overlay hover:text-text-primary')
