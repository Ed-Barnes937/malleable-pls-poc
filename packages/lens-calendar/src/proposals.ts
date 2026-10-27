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
  /** Replaces the layer's proposals. An empty list clears it. */
  propose: (source: string, proposals: Proposal[]) => void
  /** Drag-to-adjust: moves or resizes one and marks it `adjusted`. */
  move: (id: string, startsAt: string, endsAt: string) => void
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
 * State and actions for one proposal layer. `save` writes an accepted
 * proposal (the calendar passes a plan item update). `rows` are the
 * calendar's current rows: an accepted ghost stays on screen until its saved
 * block arrives in them, so accepting never flickers.
 */
export function useProposalLayer({
  save,
  rows,
}: {
  save: (proposal: Proposal) => Promise<unknown>
  rows: ReadonlyArray<Pick<PlanItemOccurrence, 'id' | 'starts_at'>>
}): ProposalLayer {
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [source, setSource] = useState<string | null>(null)
  const [saved, setSaved] = useState<Map<string, number>>(new Map())
  const [saving, setSaving] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const latest = useRef(proposals)
  latest.current = proposals

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
    setSaved(new Map())
    setProposals(next)
    setSource(next.length > 0 ? from : null)
  }, [])

  const move = useCallback((id: string, startsAt: string, endsAt: string) => {
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, startsAt, endsAt, adjusted: true } : p)))
  }, [])

  const dismiss = useCallback((id: string) => drop(new Set([id])), [drop])
  const dismissAll = useCallback(() => propose('', []), [propose])

  const acceptMany = useCallback(async (ids: string[]) => {
    const targets = latest.current.filter((p) => ids.includes(p.id) && !saved.has(p.id))
    if (targets.length === 0) return
    setError(null)
    setSaving((n) => n + 1)
    const failed: string[] = []
    try {
      // One at a time, in order: each is a normal plan item update.
      for (const p of targets) {
        try {
          await save(p)
          setSaved((prev) => new Map(prev).set(p.id, Date.now()))
        } catch {
          failed.push(p.title)
        }
      }
    } finally {
      setSaving((n) => n - 1)
    }
    if (failed.length > 0) {
      setError(`Couldn't save ${failed.map((t) => `"${t}"`).join(', ')}. Still drafted - try again?`)
    }
  }, [save, saved])

  const savedIds = useMemo(() => new Set(saved.keys()), [saved])
  const accept = useCallback((id: string) => acceptMany([id]), [acceptMany])
  const acceptAll = useCallback(() => acceptMany(latest.current.map((p) => p.id)), [acceptMany])

  return {
    proposals: landed.size > 0 ? proposals.filter((p) => !landed.has(p.id)) : proposals,
    savedIds,
    source,
    saving: saving > 0,
    error,
    propose,
    move,
    dismiss,
    dismissAll,
    accept,
    acceptAll,
  }
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
