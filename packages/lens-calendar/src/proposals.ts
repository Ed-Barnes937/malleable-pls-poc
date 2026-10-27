import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PlanItemOccurrence } from '@pls/substrate'

/**
 * Proposals ("ghost blocks"): study time drafted for a to-do but not saved.
 * They live only in the calendar's state until the student accepts one,
 * which writes the block (`starts_at` / `ends_at` / `duration_min`) through
 * the normal plan item update; dismissing leaves the calendar as it was.
 * Help me plan's Auto-fill is one source; anything that drafts blocks (e.g.
 * re-fitting missed ones) can propose through the same layer.
 */
export interface Proposal {
  /** Unique within the layer (e.g. the task id, or `refit:<task id>`). */
  id: string
  /** The plan item (to-do) this block is for. */
  taskId: string
  title: string
  /** ISO. */
  startsAt: string
  endsAt: string
  course?: string | null
  /** A short line shown on hover, e.g. "Shrunk from 4h". */
  note?: string
  /** The student dragged or resized it: re-drafting keeps it where it is. */
  adjusted?: boolean
}

export interface ProposalLayer {
  /** What to draw. Accepted ones stay (not actionable) until their saved block arrives. */
  proposals: Proposal[]
  /** Accepted and saved, waiting for the real block to replace the ghost. */
  savedIds: ReadonlySet<string>
  /** Who proposed them (e.g. 'autofill'), or null when there are none. */
  source: string | null
  /** A save is in flight. */
  saving: boolean
  error: string | null
  /**
   * A calm line about ghosts the layer took out or left unsaved because
   * `validate` said they no longer hold (e.g. the to-do got a time by hand).
   */
  notice: string | null
  clearNotice: () => void
  /** Replaces the layer's proposals. An empty list clears it. */
  propose: (source: string, proposals: Proposal[]) => void
  /**
   * Drag-to-adjust: moves or resizes one and marks it `adjusted`. Refused
   * (with a notice) if the new time fails `validate` or overlaps another ghost.
   */
  move: (id: string, startsAt: string, endsAt: string) => void
  /**
   * Keyboard adjust: steps one by `minutes` (up / down, within its day) or
   * `days` (left / right). A step that would land on something keeps going
   * in the same direction to the next position that holds, so a ghost can
   * hop past a commitment; if none does, it stays put (with a notice).
   */
  nudge: (id: string, minutes: number, days: number) => void
  dismiss: (id: string) => void
  /** "Keep my plan": drops every proposal, writes nothing. */
  dismissAll: () => void
  accept: (id: string) => Promise<void>
  acceptAll: () => Promise<void>
}

const GHOST_PREFIX = 'ghost:'

/** How long an accepted block may wait for fresh rows before its ghost is dropped anyway. */
const LAND_TIMEOUT_MS = 4000

/**
 * Why a proposal no longer holds, as a clause ("it already has a time",
 * "that time overlaps Biology lecture"), or null when it is fine. Checked
 * against the caller's current data on every render, before a move, and
 * again for each proposal at the moment it is accepted.
 */
export type ProposalValidator = (proposal: Proposal, source: string) => string | null

/** How far a nudge looks for a free position: a whole day in 15-minute steps, or a week of days. */
const MAX_NUDGE_STEPS = 96

const overlaps = (a: Proposal, b: Proposal) =>
  Date.parse(a.startsAt) < Date.parse(b.endsAt) && Date.parse(b.startsAt) < Date.parse(a.endsAt)

/**
 * State and actions for one proposal layer. `save` writes an accepted
 * proposal (the calendar passes a plan item update). `rows` are the
 * calendar's current rows: an accepted ghost stays on screen until its saved
 * block arrives in them, so accepting never flickers. `validate` keeps the
 * draft honest as the calendar changes underneath it: a ghost that fails it
 * is taken out (and never saved), with a notice saying why.
 */
export function useProposalLayer({
  save,
  rows,
  validate,
  saveTogether,
}: {
  save: (proposal: Proposal) => Promise<unknown>
  /**
   * Sources whose accepted proposals are written in one call, all or
   * nothing, instead of one `save` each (re-fit: `planItems.refit`, so the
   * server checks the whole batch against the week as it is). A rejection
   * leaves every one of them drafted.
   */
  saveTogether?: Partial<Record<string, (proposals: Proposal[]) => Promise<unknown>>>
  rows: ReadonlyArray<Pick<PlanItemOccurrence, 'id' | 'starts_at'>>
  validate?: ProposalValidator
}): ProposalLayer {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [saved, setSaved] = useState<Map<string, number>>(new Map())
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const latest = useRef(proposals)
  latest.current = proposals
  const sourceRef = useRef(source)
  sourceRef.current = source
  const validateRef = useRef(validate)
  validateRef.current = validate
  const check = useCallback((p: Proposal) => validateRef.current?.(p, sourceRef.current ?? '') ?? null, [])

  const drop = useCallback((ids: ReadonlySet<string>) => {
    setProposals((prev) => {
      const next = prev.filter((p) => !ids.has(p.id))
      if (next.length === 0) setSource(null)
      return next
    })
    setSaved((prev) => {
      const next = new Map(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  // Accepted ghosts whose real block has arrived.
  const landed = useMemo(() => {
    const ids = new Set<string>()
    for (const [id] of saved) {
      const p = proposals.find((x) => x.id === id)
      const row = p && rows.find((r) => r.id === p.taskId)
      if (!p || (row?.starts_at && Date.parse(row.starts_at) === Date.parse(p.startsAt))) ids.add(id)
    }
    return ids
  }, [saved, proposals, rows])

  // Ghosts that no longer hold (their to-do got a time, a commitment landed on them).
  const invalid = proposals
    .filter((p) => !saved.has(p.id))
    .map((p) => ({ p, reason: check(p) }))
    .filter((x): x is { p: Proposal; reason: string } => x.reason !== null)
  const invalidKey = invalid.map((x) => x.p.id).join('|')
  useEffect(() => {
    if (invalid.length === 0) return
    drop(new Set(invalid.map((x) => x.p.id)))
    setNotice(invalid.map(({ p, reason }) => `Took "${p.title}" out of the suggestions: ${reason}.`).join(' '))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidKey, drop])

  // Forget landed ghosts (and, after a while, ones whose rows never came).
  useEffect(() => {
    if (saved.size === 0) return
    if (landed.size > 0) drop(landed)
    const oldest = Math.min(...saved.values())
    const timer = setTimeout(() => drop(new Set(saved.keys())), Math.max(0, oldest + LAND_TIMEOUT_MS - Date.now()))
    return () => clearTimeout(timer)
  }, [saved, landed, drop])

  const propose = useCallback((from: string, next: Proposal[]) => {
    setError(null)
    setNotice(null)
    setSaved(new Map())
    setProposals(next)
    setSource(next.length > 0 ? from : null)
  }, [])

  /** Why `next` (a moved version of proposal `id`) can't go there, or null. */
  const moveProblem = useCallback((id: string, next: Proposal) => {
    const other = latest.current.find((p) => p.id !== id && overlaps(p, next))
    return check(next) ?? (other ? `that time overlaps "${other.title}"` : null)
  }, [check])

  const place = useCallback((id: string, next: Proposal) => {
    setNotice(null)
    setProposals((prev) => prev.map((p) => (p.id === id ? next : p)))
  }, [])

  const move = useCallback((id: string, startsAt: string, endsAt: string) => {
    const current = latest.current.find((p) => p.id === id)
    if (!current) return
    const next = { ...current, startsAt, endsAt, adjusted: true }
    const reason = moveProblem(id, next)
    if (reason) {
      setNotice(`Can't move "${current.title}" there: ${reason}.`)
      return
    }
    place(id, next)
  }, [moveProblem, place])

  const nudge = useCallback((id: string, minutes: number, days: number) => {
    const current = latest.current.find((p) => p.id === id)
    if (!current) return
    const shifted = (steps: number) => {
      const [start, end] = [new Date(current.startsAt), new Date(current.endsAt)]
      for (const d of [start, end]) {
        d.setDate(d.getDate() + days * steps)
        d.setMinutes(d.getMinutes() + minutes * steps)
      }
      return { start, end }
    }
    let firstReason: string | null = null
    for (let steps = 1; steps <= (minutes !== 0 ? MAX_NUDGE_STEPS : 7); steps++) {
      const { start, end } = shifted(steps)
      // Up and down stay within the ghost's day.
      if (minutes !== 0 && !withinDay(start, end, new Date(current.startsAt))) break
      const next = { ...current, startsAt: start.toISOString(), endsAt: end.toISOString(), adjusted: true }
      const reason = moveProblem(id, next)
      if (!reason) return place(id, next)
      firstReason ??= reason
    }
    if (firstReason) setNotice(`Can't move "${current.title}" there: ${firstReason}.`)
  }, [moveProblem, place])

  const dismiss = useCallback((id: string) => drop(new Set([id])), [drop])
  const dismissAll = useCallback(() => propose('', []), [propose])

  const acceptMany = useCallback(async (ids: string[]) => {
    const targets = latest.current.filter((p) => ids.includes(p.id) && !saved.has(p.id))
    if (targets.length === 0) return
    setError(null)
    setNotice(null)
    setSaving((n) => n + 1)
    const failed: string[] = []
    const skipped: string[] = []
    const accepted: Proposal[] = []
    try {
      // One at a time, in order: each is a normal plan item update. Each is
      // checked again right before it is saved, against the latest data and
      // the blocks accepted just before it in this batch.
      const together = sourceRef.current ? saveTogether?.[sourceRef.current] : undefined
      const ready: Proposal[] = []
      for (const p of targets) {
        const earlier = (together ? ready : accepted).find((a) => overlaps(a, p))
        const reason = check(p) ?? (earlier ? `that time overlaps "${earlier.title}"` : null)
        if (reason) {
          skipped.push(`Didn't save "${p.title}": ${reason}.`)
          drop(new Set([p.id]))
          continue
        }
        if (together) {
          ready.push(p)
          continue
        }
        try {
          await save(p)
          accepted.push(p)
          setSaved((prev) => new Map(prev).set(p.id, Date.now()))
        } catch {
          failed.push(p.title)
        }
      }
      if (together && ready.length > 0) {
        try {
          await together(ready)
          const at = Date.now()
          setSaved((prev) => {
            const next = new Map(prev)
            for (const p of ready) next.set(p.id, at)
            return next
          })
        } catch {
          failed.push(...ready.map((p) => p.title))
        }
      }
    } finally {
      setSaving((n) => n - 1)
    }
    if (skipped.length > 0) setNotice(skipped.join(' '))
    if (failed.length > 0) {
      setError(`Couldn't save ${failed.map((t) => `"${t}"`).join(', ')}. Still drafted - try again?`)
    }
  }, [save, saveTogether, saved, check, drop])

  const savedIds = useMemo(() => new Set(saved.keys()), [saved])
  const accept = useCallback((id: string) => acceptMany([id]), [acceptMany])
  const acceptAll = useCallback(() => acceptMany(latest.current.map((p) => p.id)), [acceptMany])

  return {
    proposals: landed.size > 0 ? proposals.filter((p) => !landed.has(p.id)) : proposals,
    savedIds,
    source,
    saving: saving > 0,
    error,
    notice,
    clearNotice: () => setNotice(null),
    propose,
    move,
    nudge,
    dismiss,
    dismissAll,
    accept,
    acceptAll,
  }
}

/** [start, end) stays on `day`'s local date (ending at its midnight is fine). */
function withinDay(start: Date, end: Date, day: Date): boolean {
  const midnight = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  return start.toDateString() === day.toDateString() && end.getTime() <= midnight.getTime()
}

/** The plan item patch that accepting a proposal writes. */
export function acceptPatch(p: Proposal) {
  return {
    starts_at: p.startsAt,
    ends_at: p.endsAt,
    duration_min: Math.round((Date.parse(p.endsAt) - Date.parse(p.startsAt)) / 60_000),
  }
}

/** A proposal as a list row, so the grid lays it out (and drags it) like any study block. */
export function ghostRow(p: Proposal): PlanItemOccurrence {
  return {
    id: p.taskId,
    occurrence_key: `${GHOST_PREFIX}${p.id}`,
    kind: 'task',
    title: p.title,
    starts_at: p.startsAt,
    ends_at: p.endsAt,
    due_at: null,
    duration_min: null,
    status: 'open',
    recurrence: null,
    subtype: null,
    source_type: null,
    source_id: null,
    source_offset_ms: null,
    course: p.course ?? null,
    created_at: p.startsAt,
    updated_at: p.startsAt,
    series_starts_at: p.startsAt,
    series_ends_at: p.endsAt,
    series_due_at: null,
  }
}

/** The proposal id behind a ghost row's occurrence key, or null for a real row. */
export function ghostId(item: Pick<PlanItemOccurrence, 'occurrence_key'>): string | null {
  return item.occurrence_key.startsWith(GHOST_PREFIX) ? item.occurrence_key.slice(GHOST_PREFIX.length) : null
}
