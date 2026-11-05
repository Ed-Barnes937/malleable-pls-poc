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
 * doesn't fit) holds in every widget and across reloads (kept in this
 * browser, see ANSWERED_STORAGE_KEY), so the question is never raised twice.
 * Only a newly missed block (a new miss of the same to-do counts) brings it
 * back. While one widget shows new times ("Re-fit"), the others stop asking
 * about those blocks. A board asks in one widget only (see
 * `PanelManifest.missedBlocksPriority`).
 */

/** One missed block as it is now: a new miss of the same to-do is a new signature. */
export const missedBlockSignature = (p: RefitProposal) => `${p.item.id}@${p.item.ends_at}`

/** The plan item a signature is for. */
const signatureItemId = (signature: string) => signature.slice(0, signature.lastIndexOf('@'))

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

/** Local midnight of the Monday of the week `ms` is in. */
function mondayOf(ms: number): number {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d.getTime()
}

/** Whole weeks from the week of `now` to the week of `ms` (0 = this week; never negative). */
function weeksAhead(ms: number, now: number): number {
  return Math.max(0, Math.round((mondayOf(ms) - mondayOf(now)) / (7 * 24 * 3_600_000)))
}

/** "this week", "next week", "the week of 9 Nov". */
function weekName(ms: number, now: number): string {
  const ahead = weeksAhead(ms, now)
  if (ahead === 0) return 'this week'
  if (ahead === 1) return 'next week'
  return `the week of ${new Date(mondayOf(ms)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
}

/**
 * Where moved blocks went, so the student knows where to look: "Moved 2
 * blocks. They're in your calendar." when all stayed this week (the week a
 * calendar opens on), "Moved 2 blocks to next week." when all went to one
 * later week, "Moved 3 blocks: 2 this week, 1 next week." when split.
 */
function movedSentence(moved: ReadonlyArray<string>, now: number): string {
  const n = moved.length
  const byWeek = new Map<number, number[]>()
  for (const ms of moved.map(Date.parse)) {
    const ahead = weeksAhead(ms, now)
    byWeek.set(ahead, [...(byWeek.get(ahead) ?? []), ms])
  }
  const weeks = [...byWeek.entries()].sort(([a], [b]) => a - b)
  if (weeks.length === 1 && weeks[0][0] === 0) return `Moved ${n} ${plural(n, "block. It's", "blocks. They're")} in your calendar.`
  const blocks = `${n} ${plural(n, 'block', 'blocks')}`
  if (weeks.length === 1) return `Moved ${blocks} to ${weekName(weeks[0][1][0], now)}.`
  const parts = weeks.map(([ahead, starts]) => {
    const name = weekName(starts[0], now)
    return `${starts.length} ${ahead > 1 ? `in ${name}` : name}`
  })
  return `Moved ${blocks}: ${parts.join(', ')}.`
}

/**
 * "Moved 2 blocks to next week. 1 didn't fit this week, so it stays on your
 * to-do list." Where the moved blocks went (`moved`: each one's new start,
 * ISO; see `movedSentence`), then each block that didn't fit, with the
 * reason the preview gave ("before it is due" / "this week").
 */
export function movedNote(moved: ReadonlyArray<string>, noFit: RefitProposal[], now = Date.now()): string {
  const parts: string[] = []
  if (moved.length > 0) parts.push(movedSentence(moved, now))
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

/**
 * Where answers are kept: this browser's storage (flow-audit decision 4:
 * "Not now" holds until a further block is missed, across reloads). Per
 * device, as there is no per-user store for it without a migration.
 * Signatures name one miss of one block, so they never mean anything for
 * another student.
 */
export const ANSWERED_STORAGE_KEY = 'pls.missed-blocks.answered'

function loadAnswered(): ReadonlySet<string> {
  try {
    const raw = globalThis.localStorage?.getItem(ANSWERED_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveAnswered(signatures: ReadonlySet<string>) {
  try {
    globalThis.localStorage?.setItem(ANSWERED_STORAGE_KEY, JSON.stringify([...signatures]))
  } catch {
    // Storage is off or full: the answer still holds until a reload.
  }
}

// Answered blocks, shared by every widget and kept across reloads.
let handled: ReadonlySet<string> = loadAnswered()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getHandled = () => handled
const notify = () => {
  for (const listener of listeners) listener()
}

/** Marks blocks as answered for: no widget asks about them again, until another block is missed. */
export function markMissedBlocksHandled(ps: ReadonlyArray<RefitProposal>) {
  if (ps.every((p) => handled.has(missedBlockSignature(p)))) return
  handled = new Set([...handled, ...ps.map(missedBlockSignature)])
  saveAnswered(handled)
  notify()
}

/** At most this many answers are kept (the oldest go first). */
const ANSWERS_KEPT = 200

/**
 * Forgets answers that no longer apply: a block missed again (the same
 * to-do with a new signature) is a further miss, so its old answer goes and
 * it is asked about (decision 4). A block that is not missed for now (done,
 * moved, deleted) keeps its answer: an Undo can bring the same miss straight
 * back, and it must not be asked about again.
 */
function forgetAnsweredFor(all: ReadonlyArray<RefitProposal>) {
  const live = new Map(all.map((p) => [p.item.id, missedBlockSignature(p)]))
  const next = [...handled].filter((s) => {
    const now = live.get(signatureItemId(s))
    return now === undefined || now === s
  }).slice(-ANSWERS_KEPT)
  if (next.length === handled.size) return
  handled = new Set(next)
  saveAnswered(handled)
  notify()
}

/** Test seam: reads the kept answers again, as a page load does. */
export function reloadMissedBlockAnswers() {
  handled = loadAnswered()
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
  useEffect(() => {
    if (data) forgetAnsweredFor(data)
  }, [data])
  const startPreview = useCallback((ps: ReadonlyArray<RefitProposal>) => claimMissedBlocksPreview(owner, ps), [owner])
  const endPreview = useCallback(() => releaseMissedBlocksPreview(owner), [owner])
  useEffect(() => endPreview, [endPreview])
  return {
    timeZone, proposals, all, preview: data ?? undefined, refresh: refetch, toAsk,
    markHandled: markMissedBlocksHandled, startPreview, endPreview, accept,
  }
}
