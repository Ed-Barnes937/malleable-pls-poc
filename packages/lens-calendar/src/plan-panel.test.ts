import { describe, it, expect } from 'vitest'
import { PLAN_PANEL_PX, PLAN_PANEL_WEEKEND_MIN_PX, planPanelPlacement } from './plan-panel'

// The demo board's Calendar: about 900px wide, 48px of hour labels, a 12px
// scrollbar gutter, so each day column is 120px and the weekend 252px.
const demo = { width: 900, lead: 48, trail: 12 }
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6

describe('planPanelPlacement', () => {
  it('mid-week, covers the days already past, ending where today starts', () => {
    // Wednesday: Mon and Tue are past (48 + 240 = 288px of room).
    expect(planPanelPlacement(demo, WED, [THU, FRI, SUN])).toEqual({ side: 'left', left: 8, width: PLAN_PANEL_PX })
    // Friday: plenty of room; it hugs today's column.
    expect(planPanelPlacement(demo, FRI, [SAT])).toEqual({ side: 'left', left: 528 - PLAN_PANEL_PX, width: PLAN_PANEL_PX })
  })

  it('narrows rather than cover any of today', () => {
    const smaller = { width: 820, lead: 48, trail: 12 } // 108.57px columns: Wed starts at 265px
    expect(planPanelPlacement(smaller, WED, [WED])).toEqual({ side: 'left', left: 0, width: 265 })
    const narrower = { width: 780, lead: 48, trail: 12 } // Wed starts at 253.7px
    expect(planPanelPlacement(narrower, WED, [WED])).toEqual({ side: 'left', left: 0, width: 253 })
  })

  it('early in the week, fits exactly over the weekend, so Friday stays clear', () => {
    expect(planPanelPlacement(demo, MON, [MON, TUE, WED])).toEqual({ side: 'right', width: 252 })
    // The demo on a Tuesday: drafts Wed-Fri, Friday's included, and nothing docks.
    expect(planPanelPlacement(demo, TUE, [WED, THU, FRI])).toEqual({ side: 'right', width: 252 })
    // As measured on the demo board at 1440x900 (a 858px grid area, 8px scrollbar gutter).
    expect(planPanelPlacement({ width: 858, lead: 49, trail: 8 }, TUE, [WED, THU, FRI])).toEqual({ side: 'right', width: 236 })
    // A week ahead has no past days.
    expect(planPanelPlacement(demo, 0, [])).toEqual({ side: 'right', width: 252 })
    // Never wider than the panel, on a wide calendar.
    expect(planPanelPlacement({ width: 1400, lead: 48, trail: 12 }, TUE, [FRI])).toEqual({ side: 'right', width: PLAN_PANEL_PX })
  })

  it('docks beside the grid only when a draft is under it', () => {
    expect(planPanelPlacement(demo, MON, [MON, SAT])).toEqual({ side: 'docked', width: 252 })
    expect(planPanelPlacement(demo, TUE, [SUN])).toEqual({ side: 'docked', width: 252 })
    // On a narrow calendar the minimum width reaches into Friday: a Friday draft docks it then.
    const narrow = { width: 780, lead: 48, trail: 12 }
    expect(planPanelPlacement(narrow, TUE, [FRI])).toEqual({ side: 'docked', width: PLAN_PANEL_WEEKEND_MIN_PX })
    expect(planPanelPlacement(narrow, TUE, [THU])).toEqual({ side: 'right', width: PLAN_PANEL_WEEKEND_MIN_PX })
  })

  it('a week gone by has room on the left', () => {
    expect(planPanelPlacement(demo, 7, [])).toEqual({ side: 'left', left: 888 - PLAN_PANEL_PX, width: PLAN_PANEL_PX })
  })
})
