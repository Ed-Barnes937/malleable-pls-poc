/**
 * Where the floating "Plan your time" panel goes over the week grid, so it
 * never hides a drafted block:
 * - over the days already past (e.g. Mon-Tue on a Wednesday), its right edge
 *   at the start of today, when they leave room for it;
 * - else (early in the week, or a week ahead) over the weekend;
 * - unless a draft sits under the weekend: then it docks beside the grid,
 *   which gives up some width rather than hide the draft.
 */

import { useLayoutEffect, useState, type RefObject } from 'react'

/** The panel's width when it has the room. */
export const PLAN_PANEL_PX = 280
/** The narrowest it goes to fit over the days already past. */
export const PLAN_PANEL_MIN_PX = 256

export interface WeekGeometry {
  /** The grid area's width (px), panel not docked. */
  width: number
  /** From the grid's left edge to Monday's column (the hour labels). */
  lead: number
  /** From Sunday's column to the grid's right edge (the scrollbar gutter). */
  trail: number
}

export type PlanPanelPlacement =
  | { side: 'left'; left: number; width: number }
  | { side: 'right'; width: number }
  | { side: 'docked'; width: number }

/**
 * `pastDays`: how many of the week's 7 columns are days before today (0 for
 * a week ahead, 7 for one gone by). `draftDays`: the column (0 = Monday) of
 * each drafted block still waiting for an answer.
 */
export function planPanelPlacement(
  grid: WeekGeometry,
  pastDays: number,
  draftDays: ReadonlyArray<number>,
): PlanPanelPlacement {
  const column = (grid.width - grid.lead - grid.trail) / 7
  const todayLeft = grid.lead + Math.min(7, Math.max(0, pastDays)) * column
  if (pastDays > 0 && todayLeft >= PLAN_PANEL_MIN_PX) {
    const width = Math.min(PLAN_PANEL_PX, todayLeft)
    return { side: 'left', left: Math.floor(todayLeft - width), width: Math.floor(width) }
  }
  const panelLeft = grid.width - PLAN_PANEL_PX
  const covered = (day: number) => grid.lead + (day + 1) * column > panelLeft
  return draftDays.some(covered) ? { side: 'docked', width: PLAN_PANEL_PX } : { side: 'right', width: PLAN_PANEL_PX }
}

/**
 * The week grid's geometry inside `area` (the grid and, when docked, the
 * panel), measured while `active` and kept current as it resizes. The hour
 * labels and scrollbar gutter are the same docked or not, so the placement
 * never flips because docking squeezed the days.
 */
export function useWeekGeometry(area: RefObject<HTMLElement | null>, active: boolean): WeekGeometry | null {
  const [geometry, setGeometry] = useState<WeekGeometry | null>(null)
  useLayoutEffect(() => {
    const el = area.current
    if (!active || !el) return
    const grid = el.firstElementChild as HTMLElement | null
    const measure = () => {
      const columns = el.querySelectorAll<HTMLElement>('[data-day-column]')
      if (!grid || columns.length !== 7) return setGeometry(null)
      const box = grid.getBoundingClientRect()
      const next = {
        width: el.clientWidth,
        lead: Math.round(columns[0].getBoundingClientRect().left - box.left),
        trail: Math.round(box.right - columns[6].getBoundingClientRect().right),
      }
      setGeometry((g) => (g && g.width === next.width && g.lead === next.lead && g.trail === next.trail ? g : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [area, active])
  return active ? geometry : null
}
