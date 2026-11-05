import { useEffect, useState } from 'react'
import type { RefitProposal } from '@pls/substrate'
import { isConflictError, missedQuestion, movedNote, noFitLabel, refitAsk, refitUndoCopy, useMissedBlocks, type DraftUndo } from '@pls/lens-framework'
import { cn, dayAndTime } from '@pls/shared-ui'
import { CalendarClock, RotateCcw } from 'lucide-react'

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
export function RefitBanner({ course, undo }: {
  course: string | undefined
  /** Confirms a move with Undo (the widget's, see `useDraftUndo`). */
  undo: DraftUndo
}) {
  const missed = useMissedBlocks({ course })

  const [step, setStep] = useState<Step>('ask')
  const [problem, setProblem] = useState<Problem>(null)
  /** What happened, for a moment. */
  const [note, setNote] = useState<string | null>(null)

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

  // A short "done" line, then nothing.
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(t)
  }, [note])

  const markHandled = (ps: RefitProposal[]) => missed.markHandled(ps)

  if (!open) {
    if (!note) return null
    return <p role="status" data-testid="refit-note" className="min-w-0 px-1 text-meta text-text-muted">{note}</p>
  }

  const n = proposals.length

  const moveThem = async () => {
    const noFit = proposals.filter((p) => !p.starts_at || !p.ends_at)
    setStep('saving')
    setProblem(null)
    // As they were before the move, for Undo.
    const before = await undo.readBefore(fits.map((p) => p.item.id))
    missed.accept(fits.map((p) => ({ id: p.item.id, starts_at: p.starts_at!, ends_at: p.ends_at! }))).then(
      () => {
        // Shown once here, so they don't bring the question straight back.
        markHandled(noFit)
        if (before) void undo.confirm({ before, ...refitUndoCopy(fits.map((p) => p.item.title)) })
        // The move is atomic: every block with a new time moved.
        setNote(movedNote(fits.map((p) => p.starts_at!), noFit))
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
              <button type="button" onClick={() => void moveThem()} disabled={step === 'saving'} className={primary}>
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
