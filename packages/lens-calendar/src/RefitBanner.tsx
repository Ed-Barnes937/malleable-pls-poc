import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefitProposal } from '@pls/substrate'
import { isConflictError, missedQuestion, movedNote, noFitLabel, refitAsk, type MissedBlocks } from '@pls/lens-framework'
import { RotateCcw } from 'lucide-react'
import type { Proposal, ProposalLayer } from './proposals'

/** The proposal layer source for re-fitted blocks. */
export const REFIT_SOURCE = 'refit'

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

const hasTime = (p: RefitProposal) => p.starts_at != null && p.ends_at != null

function toProposal(p: RefitProposal): Proposal {
  return {
    id: `${REFIT_SOURCE}:${p.item.id}`,
    taskId: p.item.id,
    title: p.item.title,
    startsAt: p.starts_at!,
    endsAt: p.ends_at!,
    course: p.item.course,
    note: 'Re-fitted: its last time passed',
  }
}

export interface RefitDraft {
  missed: MissedBlocks
  /** What accepting re-fit ghosts writes: one atomic `planItems.refit` for all of them. */
  save: (proposals: Proposal[]) => Promise<unknown>
  /** Blocks moved in this preview so far. */
  moved: number
  resetMoved: () => void
  /**
   * The server refused the last accept (the week changed): the preview it
   * was based on, until fresh times have been shown; else null.
   */
  stale: RefitProposal[] | null
  clearStale: () => void
}

/**
 * The calendar's side of re-fitting: called before the proposal layer is
 * created, so its `save` can be the layer's `saveTogether.refit`. Accepting
 * goes through `planItems.refit` (never per-item updates), so the server's
 * atomic, stale-preview check covers every block.
 */
export function useRefitDraft(missed: MissedBlocks): RefitDraft {
  const [moved, setMoved] = useState(0)
  const [stale, setStale] = useState<RefitProposal[] | null>(null)
  const latest = useRef(missed)
  latest.current = missed
  const save = useCallback(async (proposals: Proposal[]) => {
    const { accept, preview } = latest.current
    try {
      const result = await accept(proposals.map((p) => ({ id: p.taskId, starts_at: p.startsAt, ends_at: p.endsAt })))
      setMoved((n) => n + result.moved)
    } catch (err) {
      if (isConflictError(err)) setStale(preview ?? [])
      throw err
    }
  }, [])
  return {
    missed,
    save,
    moved,
    resetMoved: useCallback(() => setMoved(0), []),
    stale,
    clearStale: useCallback(() => setStale(null), []),
  }
}

/**
 * "2 blocks didn't happen. Re-fit them?" in the Calendar: the same calm
 * question as the To-do widget (and the same answers: dismissing in one
 * widget holds in the other, see `useMissedBlocks`), but the new times are
 * shown as ghost blocks on the grid, through the calendar's proposal layer,
 * to drag, accept ("Move them") or dismiss ("Keep my plan"). One draft at a
 * time: while other suggestions (an Auto-fill draft) are waiting, it says so
 * instead of replacing them. Every course: the calendar shows them all.
 */
export function RefitBanner({
  refit,
  layer,
  onReveal,
}: {
  refit: RefitDraft
  layer: ProposalLayer
  /** Bring a new time into view (e.g. switch to the week it is in). */
  onReveal: (startsAt: string) => void
}) {
  const { missed, moved, resetMoved, stale, clearStale } = refit
  /** The blocks this preview asked about, and the ones with no new time. */
  const [session, setSession] = useState<{ asked: RefitProposal[]; noFit: RefitProposal[] } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)

  const previewing = layer.source === REFIT_SOURCE
  const otherDraft = layer.proposals.length > 0 && !previewing

  // A short "done" line, then nothing.
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(t)
  }, [note])

  // The preview ends when its ghosts are all accepted or dismissed: those
  // blocks are answered for, and the student hears what happened.
  useEffect(() => {
    if (!session || previewing) return
    missed.markHandled(session.asked)
    if (moved > 0 || session.noFit.length > 0) setNote(movedNote(moved, session.noFit))
    setSession(null)
    setChanged(false)
    resetMoved()
    clearStale()
  }, [session, previewing, moved, missed, resetMoved, clearStale])

  // The server refused an accept because the week changed: once the fresh
  // preview is in, the blocks still drafted get their fresh times.
  useEffect(() => {
    if (!stale || !session || !missed.preview || missed.preview === stale) return
    clearStale()
    const drafted = new Set(layer.proposals.filter((p) => !layer.savedIds.has(p.id)).map((p) => p.taskId))
    const fresh = missed.all.filter((p) => drafted.has(p.item.id))
    setSession({ ...session, noFit: [...session.noFit, ...fresh.filter((p) => !hasTime(p))] })
    setChanged(true)
    layer.propose(REFIT_SOURCE, fresh.filter(hasTime).map(toProposal))
  }, [stale, missed.preview, missed.all, session, layer, clearStale])

  const asking = missed.proposals
  if (!previewing && asking.length === 0) {
    return note ? <p role="status" data-testid="refit-note" className="shrink-0 px-1 text-[11px] text-text-secondary">{note}</p> : null
  }

  const startPreview = () => {
    const fits = asking.filter(hasTime)
    const noFit = asking.filter((p) => !hasTime(p))
    setNote(null)
    if (fits.length === 0) {
      // Nothing to show on the grid: say so once and leave them on the list.
      missed.markHandled(asking)
      setNote(movedNote(0, noFit))
      return
    }
    resetMoved()
    setSession({ asked: asking, noFit })
    layer.propose(REFIT_SOURCE, fits.map(toProposal))
    onReveal(fits[0].starts_at!)
  }

  const notNow = () => {
    missed.markHandled(asking)
    setNote(null)
  }

  const asked = session?.asked.length ?? asking.length
  const open = layer.proposals.filter((p) => !layer.savedIds.has(p.id)).length

  return (
    <section
      data-testid="refit-banner"
      aria-label="Blocks that didn't happen"
      className="flex shrink-0 flex-col gap-1.5 rounded-xl bg-amber-200/[0.06] px-3 py-1.5 ring-1 ring-amber-200/15"
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <RotateCcw className="h-3.5 w-3.5 shrink-0 text-amber-200/70" aria-hidden />
        <p className="min-w-0 flex-1 text-[11px] text-text-primary">
          {missedQuestion(asked)}{' '}
          {previewing
            ? `${plural(open, 'Here is where it could go', 'Here is where they could go')} - drag to adjust, nothing moves until you accept.`
            : refitAsk(asking.length)}
        </p>
        <div className="ml-auto flex gap-1.5">
          {previewing ? (
            <>
              <button type="button" onClick={() => void layer.acceptAll()} disabled={layer.saving || open === 0} className={primary}>
                {layer.saving ? 'Moving...' : plural(open, 'Move it', 'Move them')}
              </button>
              <button type="button" onClick={layer.dismissAll} disabled={layer.saving} className={secondary}>
                Keep my plan
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={startPreview} disabled={otherDraft} className={primary}>Re-fit</button>
              <button type="button" onClick={notNow} className={secondary}>Not now</button>
            </>
          )}
        </div>
      </div>
      {!previewing && otherDraft && (
        <p role="status" className="pl-5 text-[11px] text-text-secondary">
          Accept or keep the suggested blocks first - one draft at a time.
        </p>
      )}
      {previewing && changed && (
        <p role="status" className="pl-5 text-[11px] text-text-secondary">Your week changed, so here are fresh times.</p>
      )}
      {previewing && layer.error && !stale && (
        <p role="status" className="pl-5 text-[11px] text-text-secondary">{layer.error}</p>
      )}
      {previewing && session && session.noFit.length > 0 && (
        <ul className="flex flex-col gap-0.5 pl-5" aria-label="Blocks with no new time">
          {session.noFit.map((p) => (
            <li key={p.item.id} data-testid="refit-no-fit" className="text-[11px] text-text-secondary">
              <span className="text-text-primary">{p.item.title}</span>: {noFitLabel(p)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const button = 'rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'
const primary = `${button} bg-accent text-accent-foreground hover:bg-accent/90`
const secondary = `${button} text-text-secondary ring-1 ring-border-subtle hover:bg-surface-overlay hover:text-text-primary`
