import { describe, it, expect } from 'vitest'
import { PLAN_PANEL_PX, planPanelPlacement } from './plan-panel'

// The demo board's Calendar: about 900px wide, 48px of hour labels, a 12px
// scrollbar gutter, so each day column is 120px.
const demo = { width: 900, lead: 48, trail: 12 }
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5, SUN = 6

describe('planPanelPlacement', () => {
  it('mid-week, covers the days already past, ending where today starts', () => {
    // Wednesday: Mon and Tue are past (48 + 240 = 288px of room).
    expect(planPanelPlacement(demo, WED, [THU, FRI, SUN])).toEqual({ side: 'left', left: 8, width: PLAN_PANEL_PX })
    // Friday: plenty of room; it hugs today's column.
    expect(planPanelPlacement(demo, FRI, [SAT])).toEqual({ side: 'left', left: 528 - PLAN_PANEL_PX, width: PLAN_PANEL_PX })
  })

  it('narrows a little rather than cover any of today', () => {
    const smaller = { width: 820, lead: 48, trail: 12 } // 108.57px columns: Wed starts at 265px
    expect(planPanelPlacement(smaller, WED, [WED])).toEqual({ side: 'left', left: 0, width: 265 })
  })

  it('early in the week, falls back to the weekend', () => {
    expect(planPanelPlacement(demo, MON, [MON, TUE, WED])).toEqual({ side: 'right', width: PLAN_PANEL_PX })
    expect(planPanelPlacement(demo, TUE, [TUE, THU])).toEqual({ side: 'right', width: PLAN_PANEL_PX })
    // A week ahead has no past days.
    expect(planPanelPlacement(demo, 0, [])).toEqual({ side: 'right', width: PLAN_PANEL_PX })
  })

  it('docks beside the grid rather than hide a draft under the weekend', () => {
    expect(planPanelPlacement(demo, MON, [MON, SUN])).toEqual({ side: 'docked', width: PLAN_PANEL_PX })
    // The weekend panel also covers the end of Friday (it is wider than two days).
    expect(planPanelPlacement(demo, TUE, [FRI])).toEqual({ side: 'docked', width: PLAN_PANEL_PX })
    expect(planPanelPlacement(demo, TUE, [THU])).toEqual({ side: 'right', width: PLAN_PANEL_PX })
  })

  it('a week gone by has room on the left', () => {
    expect(planPanelPlacement(demo, 7, [])).toEqual({ side: 'left', left: 888 - PLAN_PANEL_PX, width: PLAN_PANEL_PX })
  })
})
