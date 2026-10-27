import { useCallback, useEffect, useRef, useState } from 'react'
import type { PlanItemOccurrence } from '@pls/substrate'

export type TodoStatus = 'open' | 'done'

/**
 * Ticking and unticking a to-do, in order. Each to-do's status writes go out
 * one after another (tick, Undo, tick again can't land out of order), and
 * until the server agrees the list shows what the student last asked for,
 * so a slow save never flashes the old state back.
 */
export function useStatusWrites(
  items: PlanItemOccurrence[] | null | undefined,
  send: (id: string, status: TodoStatus) => Promise<unknown>,
  /** A write that failed and wasn't followed by another: the list falls back to the server's state. */
  onFailed?: (id: string) => void,
) {
  /** What the student last asked for, per to-do, until the server shows it. */
  const [wanted, setWanted] = useState<ReadonlyMap<string, TodoStatus>>(() => new Map())
  /** The last queued write per to-do; each new one waits for it. */
  const queue = useRef(new Map<string, Promise<unknown>>())
  /** Bumped as each write settles, so the check below runs even if the refetch changes nothing. */
  const [settled, setSettled] = useState(0)
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
        if (queue.current.get(id) === write) queue.current.delete(id)
        setSettled((n) => n + 1)
      },
      () => {
        if (queue.current.get(id) !== write) return
        queue.current.delete(id)
        forget(id)
        latest.current.onFailed?.(id)
      },
    )
  }, [forget])

  // Once nothing is queued and the fetched row matches (or is gone), the
  // server's word is the truth again.
  useEffect(() => {
    if (!items || wanted.size === 0) return
    for (const [id, status] of wanted) {
      if (queue.current.has(id)) continue
      const row = items.find((item) => item.id === id)
      if (!row || row.status === status) forget(id)
    }
  }, [items, wanted, settled, forget])

  const statusOf = useCallback(
    (item: PlanItemOccurrence) => wanted.get(item.id) ?? item.status,
    [wanted],
  )

  return { statusOf, setStatus }
}
