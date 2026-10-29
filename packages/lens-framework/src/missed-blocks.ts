import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { RefitProposal } from '@pls/substrate'
import { useSubstrate, useSubstrateMutations } from './substrate-context'

/**
 * "2 blocks didn't happen. Re-fit them?": the shared side of re-fitting
 * missed study blocks, used by every widget that asks (To-do, Calendar).
 * The rules and the preview are the server's (`planItems.refitPreview` /
 * `planItems.refit`, rules in `@pls/substrate` planning); this module holds
 * the student-facing copy and which blocks the student already answered for.
 *
 * Answering ("Not now", "Keep my plan", moving them, or being told one
 * doesn't fit) holds in every widget until the page is reloaded (it is
 * module state), so the question is never raised twice. Only a newly missed block
 * (a new miss of the same to-do counts) brings it back. While one widget
 * shows new times ("Re-fit"), the others stop asking about those blocks.
 */

/** One missed block as it is now: a new miss of the same to-do is a new signature. */
export const missedBlockSignature = (p: RefitProposal) => `${p.item.id}@${p.item.ends_at}`

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/**
 * Why a missed block has no new time: there is no free time before it is
 * due (it's still due later), or none in the re-fit look-ahead.
 */
function noFitWhen(p: RefitProposal): 'before it is due' | 'this week' {
  const dueAhead = p.item.due_at != null && Date.parse(p.item.due_at) > Date.now()
  return dueAhead ? 'before it is due' : 'this week'
}

/** "No free time before it is due. It stays on your list." */
export function noFitLabel(p: RefitProposal): string {
  return `No free time ${noFitWhen(p)}. It stays on your list.`
}

/** "2 blocks didn't happen." */
export function missedQuestion(n: number): string {
  return plural(n, "1 block didn't happen.", `${n} blocks didn't happen.`)
}

/** "Re-fit them?" */
export function refitAsk(n: number): string {
  return plural(n, 'Re-fit it?', 'Re-fit them?')
}

/**
 * "Moved 2 blocks. They're in your calendar. 1 didn't fit this week, so it
 * stays on your to-do list." Each block that didn't fit is reported with the
 * reason the preview gave ("before it is due" / "this week").
 */
export function movedNote(moved: number, noFit: RefitProposal[]): string {
  const parts: string[] = []
  if (moved > 0) parts.push(`Moved ${moved} ${plural(moved, "block. It's", "blocks. They're")} in your calendar.`)
  const beforeDue = noFit.filter((p) => noFitWhen(p) === 'before it is due').length
  const thisWeek = noFit.length - beforeDue
  if (thisWeek > 0) {
    parts.push(`${thisWeek} didn't fit this week, so ${plural(thisWeek, 'it stays', 'they stay')} on your to-do list.`)
  }
  if (beforeDue > 0) {
    parts.push(`${beforeDue} didn't fit before ${plural(beforeDue, 'it is', 'they are')} due, so ${plural(beforeDue, 'it stays', 'they stay')} on your to-do list.`)
  }
  return parts.join(' ')
}

// Answered blocks, shared by every widget until the page is reloaded.
let handled: ReadonlySet<string> = new Set()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getHandled = () => handled
const notify = () => {
  for (const listener of listeners) listener()
}

/** Marks blocks as answered for: no widget asks about them again until a reload. */
export function markMissedBlocksHandled(ps: ReadonlyArray<RefitProposal>) {
  if (ps.every((p) => handled.has(missedBlockSignature(p)))) return
  handled = new Set([...handled, ...ps.map(missedBlockSignature)])
  notify()
}

// Blocks a widget is showing new times for right now, by widget: one preview
// at a time per block, so no other widget asks about them meanwhile.
let previewing: ReadonlyMap<symbol, ReadonlySet<string>> = new Map()
const getPreviewing = () => previewing

/** `owner` is showing new times for `ps`: other widgets stop asking about them until it releases them. */
export function claimMissedBlocksPreview(owner: symbol, ps: ReadonlyArray<RefitProposal>) {
  const next = new Map(previewing)
  next.set(owner, new Set(ps.map(missedBlockSignature)))
  previewing = next
  notify()
}

/** `owner`'s preview ended: blocks it did not answer for are asked about again everywhere. */
export function releaseMissedBlocksPreview(owner: symbol) {
  if (!previewing.has(owner)) return
  const next = new Map(previewing)
  next.delete(owner)
  previewing = next
  notify()
}

/** Whether another widget than `owner` is showing new times for `p`. */
function previewedElsewhere(p: RefitProposal, owner: symbol, claims: ReadonlyMap<symbol, ReadonlySet<string>>): boolean {
  const signature = missedBlockSignature(p)
  for (const [other, signatures] of claims) if (other !== owner && signatures.has(signature)) return true
  return false
}

/** The browser's zone: the student's study day is read in it. */
function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

export interface MissedBlocks {
  /** The zone the preview (and an accept) reads the study day in. */
  timeZone: string
  /** Missed blocks not answered for yet (in `course`, if given), oldest first, each with its new time or none. */
  proposals: RefitProposal[]
  /** Every missed block the server sees, answered or not (e.g. to check a ghost still is one). */
  all: RefitProposal[]
  /** The latest preview as loaded (undefined until then); a new identity whenever it changes. */
  preview: RefitProposal[] | undefined
  /**
   * Asks the server for the preview now and resolves with it (every missed
   * block, as `all`): times shown to the student should come from here, so
   * they never lag behind a week that changed elsewhere.
   */
  refresh: () => Promise<RefitProposal[]>
  /** Of `ps`, the ones this widget would ask about (its course, not answered for yet). */
  toAsk: (ps: ReadonlyArray<RefitProposal>) => RefitProposal[]
  markHandled: (ps: ReadonlyArray<RefitProposal>) => void
  /**
   * This widget is showing new times for `ps` ("Here is where they could
   * go"): until `endPreview`, no other widget asks about them, so the two
   * never disagree. Ends by itself when the widget unmounts.
   */
  startPreview: (ps: ReadonlyArray<RefitProposal>) => void
  endPreview: () => void
  /**
   * Moves blocks to their new times in one atomic `planItems.refit`; the
   * server refuses (a CONFLICT, see `isConflictError`) if the week changed
   * since the preview, and the preview refreshes either way.
   */
  accept: (blocks: { id: string; starts_at: string; ends_at: string }[]) => Promise<{ moved: number }>
}

/**
 * The missed blocks a widget should ask about. Placement never depends on
 * scope; `course` only narrows which blocks this widget raises.
 */
export function useMissedBlocks({ course }: { course?: string | null } = {}): MissedBlocks {
  const reader = useSubstrate()
  const acceptRefit = useSubstrateMutations().useAcceptRefit()
  const [timeZone] = useState(localTimeZone)
  const [owner] = useState(() => Symbol('refit preview'))
  const { data, refetch } = reader.useRefitPreview(timeZone)
  const answered = useSyncExternalStore(subscribe, getHandled, getHandled)
  const claims = useSyncExternalStore(subscribe, getPreviewing, getPreviewing)
  const all = data ?? []
  const asks = useCallback(
    (p: RefitProposal, done: ReadonlySet<string>, inPreview: ReadonlyMap<symbol, ReadonlySet<string>>) =>
      (!course || p.item.course === course) && !done.has(missedBlockSignature(p)) && !previewedElsewhere(p, owner, inPreview),
    [course, owner],
  )
  const toAsk = useCallback(
    (ps: ReadonlyArray<RefitProposal>) => ps.filter((p) => asks(p, getHandled(), getPreviewing())),
    [asks],
  )
  const proposals = all.filter((p) => asks(p, answered, claims))
  const accept = useCallback(
    (blocks: { id: string; starts_at: string; ends_at: string }[]) => acceptRefit.mutateAsync({ timeZone, blocks }),
    [acceptRefit, timeZone],
  )
  const startPreview = useCallback((ps: ReadonlyArray<RefitProposal>) => claimMissedBlocksPreview(owner, ps), [owner])
  const endPreview = useCallback(() => releaseMissedBlocksPreview(owner), [owner])
  useEffect(() => endPreview, [endPreview])
  return {
    timeZone, proposals, all, preview: data ?? undefined, refresh: refetch, toAsk,
    markHandled: markMissedBlocksHandled, startPreview, endPreview, accept,
  }
}
