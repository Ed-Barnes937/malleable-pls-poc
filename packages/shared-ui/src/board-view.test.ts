import { describe, expect, it } from 'vitest'
import { boardScrollFor } from './board-view'

// A board view from 100 to 900 on screen, scrolled to 500; gap 16.
const view = { top: 100, bottom: 900 }

describe('boardScrollFor', () => {
  it('leaves the board alone when the target is in view', () => {
    expect(boardScrollFor(view, 500, { top: 300, bottom: 320 })).toBeNull()
  })

  it('scrolls up just enough to show a target above the view', () => {
    // 200px above the view's top, plus the gap.
    expect(boardScrollFor(view, 500, { top: -100, bottom: -80 })).toBe(500 - 216)
  })

  it('scrolls down just enough to show a target below the view', () => {
    expect(boardScrollFor(view, 500, { top: 950, bottom: 1000 })).toBe(500 + 116)
  })

  it('keeps the moment in view too when it fits with the target', () => {
    const target = { top: -100, bottom: -80 }
    const keep = { top: 600, bottom: 640 }
    const top = boardScrollFor(view, 500, target, [keep])!
    const shift = top - 500
    // Both end up between 116 and 884 on screen.
    expect(target.top - shift).toBeGreaterThanOrEqual(116)
    expect(keep.bottom - shift).toBeLessThanOrEqual(884)
  })

  it('scrolls far enough down to keep the moment when the target is below it', () => {
    expect(boardScrollFor(view, 0, { top: 1000, bottom: 1040 }, [{ top: 400, bottom: 420 }])).toBe(1040 - 884)
  })

  it('scrolls only as far as the target needs when the moment is already in view', () => {
    expect(boardScrollFor(view, 500, { top: -100, bottom: -80 }, [{ top: 300, bottom: 320 }])).toBe(500 - 216)
  })

  it('shows only the target when the two do not fit together', () => {
    expect(boardScrollFor(view, 500, { top: -100, bottom: -80 }, [{ top: 2000, bottom: 2040 }])).toBe(500 - 216)
  })

  it('keeps what it can, in order: the moment before the day header', () => {
    const target = { top: -100, bottom: -80 }
    const moment = { top: 600, bottom: 640 }
    const header = { top: -200, bottom: -170 }
    // Header, block and moment span 840px: more than the 768 there is room for, so the header goes.
    expect(boardScrollFor(view, 500, target, [moment, header])).toBe(500 - 216)
    // Without the moment, the header fits with the block.
    expect(boardScrollFor(view, 500, target, [null, header])).toBe(500 - 316)
  })

  it('shows a target taller than the view from its top', () => {
    expect(boardScrollFor(view, 500, { top: 200, bottom: 1400 })).toBe(500 + 84)
  })
})
