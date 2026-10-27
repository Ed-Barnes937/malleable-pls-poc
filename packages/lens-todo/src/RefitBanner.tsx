import { useEffect, useState } from 'react'
import type { RefitProposal } from '@pls/substrate'
import { isConflictError, missedQuestion, movedNote, noFitLabel, refitAsk, useMissedBlocks } from '@pls/lens-framework'
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
export function RefitBanner({ course }: { course: string | undefined }) {
  const missed = useMissedBlocks({ course })

  const [step, setStep] = useState<Step>('ask')
  const [problem, setProblem] = useState<Problem>(null)
  const [note, setNote] = useState<string | null>(null)

  // Blocks the student already answered for (here or in another widget) are left out.
  const proposals = missed.proposals
  const fits = proposals.filter((p) => p.starts_at && p.ends_at)
  const open = proposals.length > 0

  // Once nothing is left to ask about, the next miss starts with the question.
  useEffect(() => {
    if (!open) {
      setStep('ask')
      setProblem(null)
    }
  }, [open])

  // A short "done" line, then nothing.
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(t)
  }, [note])

  const markHandled = (ps: RefitProposal[]) => missed.markHandled(ps)

  if (!open) {
    return note ? <p role="status" className="px-1 text-[11px] text-neutral-500">{note}</p> : null
  }

  const n = proposals.length

  const moveThem = () => {
    const noFit = proposals.filter((p) => !p.starts_at || !p.ends_at)
    setStep('saving')
    setProblem(null)
    missed.accept(fits.map((p) => ({ id: p.item.id, starts_at: p.starts_at!, ends_at: p.ends_at! }))).then(
      (result) => {
        // Shown once here, so they don't bring the question straight back.
        markHandled(noFit)
        setNote(movedNote(result.moved, noFit))
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
    setNote(null)
  }

  const question = missedQuestion(n)

  return (
    <section
      data-testid="refit-banner"
      aria-label="Blocks that didn't happen"
      className="flex flex-col gap-2 rounded-lg bg-amber-200/5 px-2.5 py-2 ring-1 ring-amber-200/15"
    >
      <div className="flex items-start gap-2">
        <RotateCcw className="mt-0.5 h-3 w-3 shrink-0 text-attention" />
        <p className="flex-1 text-xs text-neutral-300">
          {question}{' '}
          {step === 'ask'
            ? refitAsk(n)
            : fits.length > 0
              ? plural(fits.length, 'Here is where it could go:', 'Here is where they could go:')
              : plural(n, 'There is no free time for it right now.', 'There is no free time for them right now.')}
        </p>
      </div>

      {step !== 'ask' && (
        <ul className="flex flex-col gap-1 pl-5" aria-label="New times">
          {proposals.map((p) => (
            <li key={p.item.id} data-testid="refit-proposal" className="flex flex-col text-[11px]">
              <span className="truncate text-neutral-300">{p.item.title}</span>
              {p.starts_at ? (
                <span className="flex items-center gap-1 text-neutral-500">
                  <CalendarClock className="h-2.5 w-2.5" />
                  {dayAndTime(p.starts_at)}
                </span>
              ) : (
                <span className="text-neutral-500">{noFitLabel(p)}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {problem && step === 'preview' && (
        <p role="status" className="pl-5 text-[11px] text-neutral-500">
          {problem === 'failed'
            ? "Couldn't move them just now. Try again in a moment."
            : fits.length > 0 ? 'Your week changed, so here are fresh times.' : 'Your week changed.'}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 pl-5">
        {step === 'ask' ? (
          <>
            <button type="button" onClick={() => setStep('preview')} className={primary}>Re-fit</button>
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

const button = 'rounded-md px-2 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const primary = cn(button, 'bg-accent/15 text-accent hover:bg-accent/25')
const secondary = cn(button, 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200')
