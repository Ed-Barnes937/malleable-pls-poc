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
  /**
   * The server refused the last accept (the week changed): `fresh` is the
   * preview fetched straight after (null while it loads), until its times
   * have been shown; else null.
   */
  stale: { fresh: RefitProposal[] | null } | null
  clearStale: () => void
  /**
   * To-dos the student answered for in this preview: moved, or dismissed
   * (one ghost, or "Keep my plan"). A ghost the layer took out by itself
   * (something now covers its time) is not an answer.
   */
  answered: ReadonlySet<string>
  /** The layer's `onDismiss`: the student dismissed these ghosts. */
  onDismiss: (proposals: Proposal[], source: string) => void
  /** A new preview starts: nothing answered or moved yet. */
  reset: () => void
}

/**
 * The calendar's side of re-fitting: called before the proposal layer is
 * created, so its `save` can be the layer's `saveTogether.refit`. Accepting
 * goes through `planItems.refit` (never per-item updates), so the server's
 * atomic, stale-preview check covers every block.
 */
export function useRefitDraft(missed: MissedBlocks): RefitDraft {
  const [moved, setMoved] = useState(0)
  const [stale, setStale] = useState<{ fresh: RefitProposal[] | null } | null>(null)
  const [answered, setAnswered] = useState<ReadonlySet<string>>(() => new Set())
  const answer = useCallback((ids: string[]) => setAnswered((prev) => new Set([...prev, ...ids])), [])
  const latest = useRef(missed)
  latest.current = missed
  const save = useCallback(async (proposals: Proposal[]) => {
    const { accept, refresh } = latest.current
    try {
      const result = await accept(proposals.map((p) => ({ id: p.taskId, starts_at: p.startsAt, ends_at: p.endsAt })))
      setMoved((n) => n + result.moved)
      answer(proposals.map((p) => p.taskId))
    } catch (err) {
      if (isConflictError(err)) {
        setStale({ fresh: null })
        // No fresh times (the refresh failed): the blocks are simply asked about again.
        refresh().then((fresh) => setStale({ fresh }), () => setStale({ fresh: [] }))
      }
      throw err
    }
  }, [answer])
  return {
    missed,
    save,
    moved,
    stale,
    clearStale: useCallback(() => setStale(null), []),
    answered,
    onDismiss: useCallback((proposals: Proposal[], source: string) => {
      if (source === REFIT_SOURCE) answer(proposals.map((p) => p.taskId))
    }, [answer]),
    reset: useCallback(() => {
      setMoved(0)
      setStale(null)
      setAnswered(new Set())
    }, []),
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
  const { missed, moved, stale, clearStale, answered, reset } = refit
  /** The blocks this preview asked about, and the ones with no new time. */
  const [session, setSession] = useState<{ asked: RefitProposal[]; noFit: RefitProposal[] } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [changed, setChanged] = useState(false)
  /** Fetching fresh times for Re-fit. */
  const [loading, setLoading] = useState(false)

  const previewing = layer.source === REFIT_SOURCE
  const otherDraft = layer.proposals.length > 0 && !previewing

  // A short "done" line, then nothing.
  useEffect(() => {
    if (!note) return
    const t = setTimeout(() => setNote(null), 6000)
    return () => clearTimeout(t)
  }, [note])

  // The preview ends when its ghosts are all gone. Only the blocks the
  // student answered for (moved, dismissed, or told they don't fit) are
  // not asked about again; one whose ghost the layer took out by itself
  // (something now covers that time) is asked about again, with a fresh
  // time. A refused accept waits for its fresh times first.
  useEffect(() => {
    if (!session || previewing || stale) return
    missed.markHandled([...session.asked.filter((p) => answered.has(p.item.id)), ...session.noFit])
    if (moved > 0 || session.noFit.length > 0) setNote(movedNote(moved, session.noFit))
    setSession(null)
    setChanged(false)
    reset()
  }, [session, previewing, stale, moved, answered, missed, reset])

  // The server refused an accept because the week changed: once the fresh
  // preview is in, every block of this preview the student hasn't answered
  // for and that is still missed gets its fresh time, including one whose
  // ghost was just taken out because something now covers it.
  useEffect(() => {
    if (!stale?.fresh) return
    clearStale()
    if (!session) return
    const askedIds = new Set(session.asked.map((p) => p.item.id))
    const fresh = stale.fresh.filter((p) => askedIds.has(p.item.id) && !answered.has(p.item.id))
    setSession({ ...session, noFit: fresh.filter((p) => !hasTime(p)) })
    setChanged(true)
    layer.propose(REFIT_SOURCE, fresh.filter(hasTime).map(toProposal))
  }, [stale, session, answered, layer, clearStale])

  const asking = missed.proposals
  if (!previewing && asking.length === 0) {
    return note ? <p role="status" data-testid="refit-note" className="shrink-0 px-1 text-[11px] text-text-secondary">{note}</p> : null
  }

  // The times shown come from a preview fetched now, never one that may lag
  // behind a week changed elsewhere.
  const startPreview = async () => {
    setNote(null)
    setLoading(true)
    let current: RefitProposal[]
    try {
      current = missed.toAsk(await missed.refresh())
    } catch {
      current = asking
    } finally {
      setLoading(false)
    }
    if (current.length === 0) return
    const fits = current.filter(hasTime)
    const noFit = current.filter((p) => !hasTime(p))
    if (fits.length === 0) {
      // Nothing to show on the grid: say so once and leave them on the list.
      missed.markHandled(current)
      setNote(movedNote(0, noFit))
      return
    }
    reset()
    setSession({ asked: current, noFit })
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
              <button type="button" onClick={() => void startPreview()} disabled={otherDraft || loading} className={primary}>
                {loading ? 'Finding times...' : 'Re-fit'}
              </button>
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
