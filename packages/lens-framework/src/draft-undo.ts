import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { PlanItemUndoState } from '@pls/substrate'
import { useSubstrateMutations } from './substrate-context'
import { confirmWithUndo } from './undo-toast'
import type { LensProps } from './types'

/** The Undo toast key every accepted draft shares (Auto-fill, re-fit, Book the rest). */
export const DRAFT_ACCEPTED_KEY = 'draft-accepted'

/** The Undo toast's copy for a re-fit move, in every widget that asks. */
export function refitUndoCopy(titles: ReadonlyArray<string>): { message: string; failMessage: string } {
  return {
    message: titles.length === 1 ? `Moved "${titles[0]}"` : `Moved ${titles.length} blocks`,
    failMessage: titles.length === 1 ? "Couldn't put that block back." : "Couldn't put those blocks back.",
  }
}

/**
 * What a stale Undo says it left (flow-audit decision 31): the items the
 * student changed after the Accept stay as they are. `total`: how many
 * items the Undo was for.
 */
export function keptMessage(kept: ReadonlyArray<{ title: string }>, total: number): string {
  const which = kept.length === 1
    ? `"${kept[0].title}" changed since, so it stays as it is.`
    : `${kept.length} blocks changed since, so they stay as they are.`
  return kept.length < total ? `Put the rest back. ${which}` : which
}

/**
 * The Accept whose Undo toast is up, from any widget: what it left (each
 * item's and session's last change, ms), so the toast can go once one of
 * them is edited. A newer Accept replaces it, as its toast replaces the
 * older one.
 */
let shown: { token: symbol; changedAt: ReadonlyMap<string, number> } | null = null

export interface DraftUndo {
  /**
   * Reads `ids` from the server as they are now, before an Accept writes
   * them. Null when that fails: the Accept goes ahead, without Undo.
   */
  readBefore: (ids: string[]) => Promise<PlanItemUndoState[] | null>
  /**
   * After the Accept: confirms it with Undo, which puts back `before` for
   * every item still as the Accept left it (read now). Items changed since
   * are left, and the toast says so.
   */
  confirm: (change: {
    before: ReadonlyArray<PlanItemUndoState>
    message: string
    failMessage: string
    /** After an Undo that put something back. */
    onUndone?: () => void
  }) => Promise<void>
}

/**
 * Undo for an accepted draft (flow-audit decisions 19 and 31). `rows`: the
 * plan items this widget shows; once one the Accept changed is edited (it
 * changed after the Accept), the Undo toast goes, as it no longer applies
 * to all of it.
 */
export function useDraftUndo({ onNotify, onDismissNotice, rows }: {
  onNotify: LensProps['onNotify']
  onDismissNotice: LensProps['onDismissNotice']
  rows: ReadonlyArray<{ id: string; updated_at: string }> | null | undefined
}): DraftUndo {
  const mutations = useSubstrateMutations()
  const read = mutations.useReadUndoState()
  const revert = mutations.useRevertPlanItems()
  const latest = useRef({ read, revert, onNotify })
  latest.current = { read, revert, onNotify }

  useEffect(() => {
    if (!shown || !rows) return
    const { changedAt } = shown
    const edited = rows.some((r) => {
      const at = changedAt.get(r.id)
      return at !== undefined && Date.parse(r.updated_at) > at
    })
    if (!edited) return
    shown = null
    onDismissNotice?.(DRAFT_ACCEPTED_KEY)
  }, [rows, onDismissNotice])

  const readBefore = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return []
    try {
      return await latest.current.read(ids)
    } catch {
      return null
    }
  }, [])

  const confirm = useCallback<DraftUndo['confirm']>(async ({ before, message, failMessage, onUndone }) => {
    const notify = latest.current.onNotify
    if (!notify || before.length === 0) return
    let after: PlanItemUndoState[]
    try {
      after = await latest.current.read(before.map((b) => b.id))
    } catch {
      // Without what the Accept left, Undo can't tell what changed since: none is offered.
      notify({ message, key: DRAFT_ACCEPTED_KEY })
      return
    }
    const token = Symbol('accepted draft')
    shown = {
      token,
      changedAt: new Map(after.flatMap((a) => [[a.id, Date.parse(a.updated_at)] as const, ...a.sessions.map((s) => [s.id, Date.parse(s.updated_at)] as const)])),
    }
    const items = before.map((b, i) => ({ before: b, after: after[i] }))
    confirmWithUndo(notify, {
      key: DRAFT_ACCEPTED_KEY,
      message,
      failMessage,
      undo: async () => {
        if (shown?.token === token) shown = null
        const { reverted, kept } = await latest.current.revert.mutateAsync({ items })
        if (reverted.length > 0) onUndone?.()
        if (kept.length > 0) latest.current.onNotify?.({ message: keptMessage(kept, items.length), key: DRAFT_ACCEPTED_KEY })
      },
    })
  }, [])

  return useMemo(() => ({ readBefore, confirm }), [readBefore, confirm])
}

/** Test seam: forgets which Accept's toast is up. */
export function resetDraftUndo() {
  shown = null
}
