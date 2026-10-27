import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanItemOccurrence } from '@pls/substrate'

export type TodoStatus = 'open' | 'done'

/**
 * Ticking and unticking a to-do, in order. Each to-do's status writes go out
 * one after another (tick, Undo, tick again can't land out of order), and
 * until the last one has saved the list shows what the student last asked
 * for, so a slow save never flashes the old state back. `send` must resolve
 * once the lists have refetched (plan item saves do): from then on the row
 * shows the server's state, even if something else changed it meanwhile.
 */
export function useStatusWrites(
  send: (id: string, status: TodoStatus) => Promise<unknown>,
  /** A write that failed and wasn't followed by another: the list falls back to the server's state. */
  onFailed?: (id: string) => void,
) {
  /** What the student last asked for, per to-do, until its last write has saved. */
  const [wanted, setWanted] = useState<ReadonlyMap<string, TodoStatus>>(() => new Map())
  /** The last queued write per to-do; each new one waits for it. */
  const queue = useRef(new Map<string, Promise<unknown>>())
  const latest = useRef({ send, onFailed })
  useEffect(() => {
    latest.current = { send, onFailed }
  })

  const forget = useCallback((id: string) => {
    setWanted((prev) => {
      if (!prev.has(id)) return prev
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }, [])

  const setStatus = useCallback((id: string, status: TodoStatus) => {
    setWanted((prev) => new Map(prev).set(id, status))
    const before = queue.current.get(id) ?? Promise.resolve()
    const write = before.catch(() => {}).then(() => latest.current.send(id, status))
    queue.current.set(id, write)
    write.then(
      () => {
        if (queue.current.get(id) !== write) return
        queue.current.delete(id)
        forget(id)
      },
      () => {
        if (queue.current.get(id) !== write) return
        queue.current.delete(id)
        forget(id)
        latest.current.onFailed?.(id)
      },
    )
  }, [forget])

  const statusOf = useCallback(
    (item: PlanItemOccurrence) => wanted.get(item.id) ?? item.status,
    [wanted],
  )
  /** A write for this to-do is still on its way. */
  const isSaving = useCallback((id: string) => wanted.has(id), [wanted])

  return { statusOf, isSaving, setStatus }
}
