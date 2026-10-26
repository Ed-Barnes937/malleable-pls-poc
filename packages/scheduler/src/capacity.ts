import { subtract, totalMinutes, type Interval } from './intervals'
import type { ExistingPlacement, SchedulerTask } from './place'

export interface Capacity {
  /** Free minutes left after fixed existing placements. */
  freeMin: number
  /** Sum of the tasks' valid durations. */
  neededMin: number
  /** `max(0, needed - free)`: how much has to give. */
  shortfallMin: number
  /** `max(0, free - needed)`. */
  spareMin: number
  /** `neededMin <= freeMin`. */
  fits: boolean
}

/**
 * Free minutes versus needed minutes, for honest copy such as "About 9 free
 * hours. This needs 12." Existing placements of the tasks being counted are
 * ignored (same rule as `place`), so an already-placed task is not counted
 * twice. Tasks with an invalid duration count as 0.
 *
 * `fits` is a necessary, not sufficient, condition: free time can be too
 * fragmented, or outside a task's window. `place` is the source of truth.
 */
export function capacity(
  freeSlots: ReadonlyArray<Interval>,
  tasks: ReadonlyArray<Pick<SchedulerTask, 'id' | 'durationMin'>>,
  opts: { existingPlacements?: ReadonlyArray<ExistingPlacement> } = {},
): Capacity {
  const ids = new Set(tasks.map((t) => t.id))
  const fixed = (opts.existingPlacements ?? []).filter(
    (e) => e.taskId === undefined || !ids.has(e.taskId),
  )
  const freeMin = totalMinutes(subtract(freeSlots, fixed))
  const neededMin = tasks.reduce(
    (sum, t) => sum + (t.durationMin > 0 && Number.isFinite(t.durationMin) ? t.durationMin : 0),
    0,
  )
  return {
    freeMin,
    neededMin,
    shortfallMin: Math.max(0, neededMin - freeMin),
    spareMin: Math.max(0, freeMin - neededMin),
    fits: neededMin <= freeMin,
  }
}
