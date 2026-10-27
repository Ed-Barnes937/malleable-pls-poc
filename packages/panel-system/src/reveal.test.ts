import { describe, it, expect } from 'vitest'
import { scrollPanelIntoView } from './reveal'
import { PLACEMENT_GAP } from './geometry'

/** A board scroller `view` px tall holding one panel; jsdom has no layout, so boxes are stubbed. */
function board(view: number, layout: { top: number; height: number } | null, box: { top: number; height: number }) {
  const scroller = document.createElement('div')
  scroller.setAttribute('data-canvas-scroll', '')
  Object.defineProperty(scroller, 'clientHeight', { value: view })
  const panel = document.createElement('div')
  panel.dataset.panelId = 'p1'
  if (layout) {
    panel.dataset.layoutTop = String(layout.top)
    panel.dataset.layoutHeight = String(layout.height)
  }
  Object.defineProperty(panel, 'offsetTop', { value: box.top })
  Object.defineProperty(panel, 'offsetHeight', { value: box.height })
  scroller.appendChild(panel)
  return scroller
}

describe('scrollPanelIntoView', () => {
  it('scrolls to where a panel is headed, not where a transition has it now', () => {
    // Leaving fullscreen: the box is still mid-way back from the top-left.
    const scroller = board(835, { top: 800, height: 380 }, { top: 300, height: 600 })
    expect(scrollPanelIntoView(scroller, 'p1')).toBe(true)
    expect(scroller.scrollTop).toBe(800 + 380 + PLACEMENT_GAP - 835)
  })

  it('falls back to the rendered box when there is no layout target (stacked)', () => {
    const scroller = board(400, null, { top: 500, height: 200 })
    scrollPanelIntoView(scroller, 'p1')
    expect(scroller.scrollTop).toBe(500 + 200 + PLACEMENT_GAP - 400)
  })
})
