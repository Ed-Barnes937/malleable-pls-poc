import { useEffect, useState } from 'react'
import type { RefitProposal } from '@pls/substrate'
import { useSubstrate, useSubstrateMutations } from '@pls/lens-framework'
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

type Step = 'ask' | 'preview' | 'saving'

/**
 * "2 blocks didn't happen. Re-fit them?": study blocks whose time passed
 * without being ticked off, re-placed in free time on request. Calm by
 * design: a gentle question, a preview of the new times, and "Not now" (which
 * hides it until another block is missed). Commitments are never involved.
 * On a course board, only that course's blocks.
 */
export function RefitBanner({ course }: { course: string | undefined }) {
  const reader = useSubstrate()
  const accept = useSubstrateMutations().useAcceptRefit()
  const [timeZone] = useState(localTimeZone)
  const { data } = reader.useRefitPreview(timeZone)
  const proposals = (data ?? []).filter((p) => !course || p.item.course === course)
  const key = proposals.map((p) => `${p.item.id}@${p.item.ends_at}`).join(',')

  const [step, setStep] = useState<Step>('ask')
  const [notNowKey, setNotNowKey] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  // A change in what was missed (one more, or all re-fit) starts over.
  useEffect(() => {
    setStep('ask')
  }, [key])

  // A short "done" line, then nothing.
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 4000)
    return () => clearTimeout(t)
  }, [note])

  if (proposals.length === 0 || key === notNowKey) {
    return note ? <p role="status" className="px-1 text-[11px] text-neutral-500">{note}</p> : null
  }

  const n = proposals.length
  const fits = proposals.filter((p) => p.starts_at && p.ends_at)

  const moveThem = () => {
    setStep('saving')
    accept.mutateAsync({
      timeZone,
      blocks: fits.map((p) => ({ id: p.item.id, starts_at: p.starts_at!, ends_at: p.ends_at! })),
    }).then(
      (result) => setNote(`Moved ${result.moved} block${result.moved !== 1 ? 's' : ''}. They're in your calendar.`),
      () => {
        // The week changed since the preview: show the fresh one.
        setStep('preview')
        setNote('Your week changed, so here are fresh times.')
      },
    )
  }

  return (
    <section
      data-testid="refit-banner"
      aria-label="Blocks that didn't happen"
      className="flex flex-col gap-2 rounded-lg bg-amber-200/5 px-2.5 py-2 ring-1 ring-amber-200/15"
    >
      <div className="flex items-start gap-2">
        <RotateCcw className="mt-0.5 h-3 w-3 shrink-0 text-amber-200/70" />
        <p className="flex-1 text-xs text-neutral-300">
          {n === 1 ? "1 block didn't happen." : `${n} blocks didn't happen.`}{' '}
          {step === 'ask' && (n === 1 ? 'Re-fit it?' : 'Re-fit them?')}
          {step !== 'ask' && (fits.length > 0 ? 'Here is where they could go:' : 'There is no free time for them right now.')}
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

      {note && <p role="status" className="pl-5 text-[11px] text-neutral-500">{note}</p>}

      <div className="flex flex-wrap gap-1.5 pl-5">
        {step === 'ask' ? (
          <>
            <button type="button" onClick={() => setStep('preview')} className={primary}>Re-fit</button>
            <button type="button" onClick={() => setNotNowKey(key)} className={secondary}>Not now</button>
          </>
        ) : (
          <>
            {fits.length > 0 && (
              <button type="button" onClick={moveThem} disabled={step === 'saving'} className={primary}>
                {step === 'saving' ? 'Moving...' : fits.length === 1 ? 'Move it' : 'Move them'}
              </button>
            )}
            <button type="button" onClick={() => setNotNowKey(key)} disabled={step === 'saving'} className={secondary}>
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
