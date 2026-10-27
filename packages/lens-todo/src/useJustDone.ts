import { useCallback, useEffect, useRef, useState } from 'react'

/** How long a just-ticked to-do stays in place, struck through, saying "Done · Undo". */
export const JUST_DONE_MS = 5000
/** Then it fades out for this long before it moves down to "Done today". */
export const JUST_DONE_FADE_MS = 300

export type JustDoneStage = 'shown' | 'fading'

/**
 * To-dos ticked off a moment ago, by id. They stay where they were for
 * `JUST_DONE_MS` so a mis-tap is easy to undo, then fade for
 * `JUST_DONE_FADE_MS` and drop out of the map.
 */
export function useJustDone() {
  const [stages, setStages] = useState<ReadonlyMap<string, JustDoneStage>>(() => new Map())
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>[]>())

  const set = useCallback((id: string, stage: JustDoneStage | null) => {
    setStages((prev) => {
      const next = new Map(prev)
      if (stage) next.set(id, stage)
      else next.delete(id)
      return next
    })
  }, [])

  const clear = useCallback((id: string) => {
    for (const t of timers.current.get(id) ?? []) clearTimeout(t)
    timers.current.delete(id)
  }, [])

  const add = useCallback((id: string) => {
    clear(id)
    set(id, 'shown')
    timers.current.set(id, [
      setTimeout(() => set(id, 'fading'), JUST_DONE_MS),
      setTimeout(() => {
        timers.current.delete(id)
        set(id, null)
      }, JUST_DONE_MS + JUST_DONE_FADE_MS),
    ])
  }, [clear, set])

  const remove = useCallback((id: string) => {
    clear(id)
    set(id, null)
  }, [clear, set])

  useEffect(() => {
    const all = timers.current
    return () => {
      for (const ts of all.values()) for (const t of ts) clearTimeout(t)
      all.clear()
    }
  }, [])

  return { stages, add, remove }
}
