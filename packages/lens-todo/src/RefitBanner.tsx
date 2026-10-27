import { useEffect, useState } from 'react'
import type { RefitProposal } from '@pls/substrate'
import { isConflictError, useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
import { cn, dayAndTime } from '@pls/shared-ui'
import { CalendarClock, RotateCcw } from 'lucide-react'

/** The browser's zone: the student's study day is read in it. */
function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

/** Why a missed block has no new time, in the student's words. */
function noFitLabel(p: RefitProposal): string {
  const dueAhead = p.item.due_at != null && Date.parse(p.item.due_at) > Date.now()
  return dueAhead
    ? 'No free time before it is due. It stays on your list.'
    : 'No free time this week. It stays on your list.'
}

/** One missed block as it is now: a new miss of the same to-do is a new signature. */
const signature = (p: RefitProposal) => `${p.item.id}@${p.item.ends_at}`

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/** "Moved 2 blocks. They're in your calendar. 1 didn't fit this week, so it stays on your to-do list." */
export function movedNote(moved: number, noFit: number): string {
  const parts: string[] = []
  if (moved > 0) parts.push(`Moved ${moved} ${plural(moved, "block. It's", "blocks. They're")} in your calendar.`)
  if (noFit > 0) {
    parts.push(`${noFit} didn't fit this week, so ${plural(noFit, 'it stays', 'they stay')} on your to-do list.`)
  }
  return parts.join(' ')
}

type Step = 'ask' | 'preview' | 'saving'
type Problem = 'conflict' | 'failed' | null

/**
 * "2 blocks didn't happen. Re-fit them?": study blocks whose time passed
 * without being ticked off, re-placed in free time on request. Calm by
 * design: a gentle question, a preview of the new times, and "Not now" /
 * "Keep my plan", after which those blocks aren't raised again (only a newly
 * missed block brings the question back). Commitments are never involved.
 * On a course board, only that course's blocks.
 */
export function RefitBanner({ course }: { course: string | undefined }) {
  const reader = useSubstrate()
  const accept = useSubstrateMutations().useAcceptRefit()
  const [timeZone] = useState(localTimeZone)
  const { data } = reader.useRefitPreview(timeZone)

  const [step, setStep] = useState<Step>('ask')
  // Blocks the student already answered for (moved, kept, or shown as not fitting).
  const [handled, setHandled] = useState<ReadonlySet<string>>(() => new Set())
  const [problem, setProblem] = useState<Problem>(null)
  const [note, setNote] = useState<string | null>(null)

  const proposals = (data ?? []).filter((p) => (!course || p.item.course === course) && !handled.has(signature(p)))
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

  const markHandled = (ps: RefitProposal[]) => setHandled((h) => new Set([...h, ...ps.map(signature)]))

  if (!open) {
    return note ? <p role="status" className="px-1 text-[11px] text-neutral-500">{note}</p> : null
  }

  const n = proposals.length

  const moveThem = () => {
    const noFit = proposals.filter((p) => !p.starts_at || !p.ends_at)
    setStep('saving')
    setProblem(null)
    accept.mutateAsync({
      timeZone,
      blocks: fits.map((p) => ({ id: p.item.id, starts_at: p.starts_at!, ends_at: p.ends_at! })),
    }).then(
      (result) => {
        // Shown once here, so they don't bring the question straight back.
        markHandled(noFit)
        setNote(movedNote(result.moved, noFit.length))
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

  const question = plural(n, "1 block didn't happen.", `${n} blocks didn't happen.`)

  return (
    <section
      data-testid="refit-banner"
      aria-label="Blocks that didn't happen"
      className="flex flex-col gap-2 rounded-lg bg-amber-200/5 px-2.5 py-2 ring-1 ring-amber-200/15"
    >
      <div className="flex items-start gap-2">
        <RotateCcw className="mt-0.5 h-3 w-3 shrink-0 text-amber-200/70" />
        <p className="flex-1 text-xs text-neutral-300">
          {question}{' '}
          {step === 'ask'
            ? plural(n, 'Re-fit it?', 'Re-fit them?')
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
