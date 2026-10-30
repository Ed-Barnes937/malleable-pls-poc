import { useCallback, useEffect, useRef, useState } from 'react'
import { isConflictError } from '@pls/lens-framework'
import type { ResourceUpdate, ResourceWithBody } from '@pls/substrate'

/** How long typing pauses before a note saves. */
export const AUTOSAVE_DELAY_MS = 800

export type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'failed' | 'conflict'

type Patch = ResourceUpdate['patch']

/**
 * Autosave for one note. Changes (body and title) gather into one patch and
 * save after a pause in typing, one save at a time and in order. Each save
 * names the `updated_at` the last one returned, so a save on top of a change
 * made elsewhere (another device) is refused with a CONFLICT instead of
 * overwriting it; the student then picks `reload` (take theirs) or
 * `keepMine` (save this text over it). A failed save is retried by the next
 * change, or `retry`. `flush` saves now (leaving the note).
 */
export function useNoteSaver(
  note: ResourceWithBody,
  save: (update: ResourceUpdate) => Promise<ResourceWithBody>,
) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const base = useRef<string | Date | undefined>(note.updated_at)
  const pending = useRef<Patch | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inFlight = useRef(false)
  // True once the student chose "keep mine": the next save skips the check.
  const force = useRef(false)
  const blocked = useRef(false)
  const saveRef = useRef(save)
  saveRef.current = save
  // Changes reported after the note closed (the editor's last words) save at once.
  const mounted = useRef(true)

  const run = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (inFlight.current || blocked.current || !pending.current) return
    const patch = pending.current
    pending.current = null
    inFlight.current = true
    setStatus('saving')
    try {
      const saved = await saveRef.current({
        id: note.id,
        patch,
        expectedUpdatedAt: force.current ? undefined : base.current,
      })
      force.current = false
      base.current = saved.updated_at
      setStatus(pending.current ? 'unsaved' : 'saved')
    } catch (err) {
      // Keep what didn't save, under anything typed since.
      pending.current = { ...patch, ...(pending.current as Patch | null) }
      if (isConflictError(err)) {
        blocked.current = true
        setStatus('conflict')
      } else {
        setStatus('failed')
      }
    } finally {
      inFlight.current = false
    }
    if (pending.current && !blocked.current) void run()
  }, [note.id])

  const change = useCallback(
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch }
      if (blocked.current) return
      if (!mounted.current) {
        void run()
        return
      }
      setStatus('unsaved')
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void run(), AUTOSAVE_DELAY_MS)
    },
    [run],
  )

  const flush = useCallback(() => void run(), [run])

  /** After a conflict: save this text over the other change. */
  const keepMine = useCallback(() => {
    blocked.current = false
    force.current = true
    void run()
  }, [run])

  /** After a conflict: drop unsaved changes and take the saved note (`fresh`). */
  const reload = useCallback((fresh: ResourceWithBody) => {
    blocked.current = false
    pending.current = null
    base.current = fresh.updated_at
    setStatus('idle')
  }, [])

  // Leaving the note saves what's left (the request outlives the view).
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      void run()
    }
  }, [run])

  return { status, change, flush, keepMine, reload, retry: flush }
}
