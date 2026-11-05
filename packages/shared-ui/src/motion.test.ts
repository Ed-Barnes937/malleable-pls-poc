import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { MOTION_TIMING, SWAP_KEYFRAMES, boardSlideKeyframes, prefersReducedMotion, useListGlide, useReducedMotion, useWidthGlide } from './motion'

function mockReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe('motion', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('slides a board in from the side of its tab', () => {
    expect(boardSlideKeyframes('right')[0]).toMatchObject({ opacity: 0, transform: 'translateX(28px)' })
    expect(boardSlideKeyframes('left')[0]).toMatchObject({ opacity: 0, transform: 'translateX(-28px)' })
  })

  it('ends every motion on the element itself, never pinned to its end values', () => {
    // An empty last keyframe is the element's own look; `backwards`, never `both`.
    expect(boardSlideKeyframes('right').at(-1)).toEqual({})
    expect(SWAP_KEYFRAMES.at(-1)).toEqual({})
    expect(MOTION_TIMING.fill).toBe('backwards')
  })

  it('reads the reduced motion setting', () => {
    mockReducedMotion(true)
    expect(prefersReducedMotion()).toBe(true)
    expect(renderHook(() => useReducedMotion()).result.current).toBe(true)
    mockReducedMotion(false)
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('useListGlide', () => {
  afterEach(() => vi.unstubAllGlobals())

  /** A list whose rows sit at `tops` (by key), counting every read of a row's place. */
  function list(tops: Record<string, number>) {
    const el = document.createElement('ul')
    const reads = { count: 0 }
    const animate = vi.fn()
    const rows = new Map<string, HTMLElement>()
    const order = (keys: string[]) => {
      el.replaceChildren(...keys.map((key) => {
        let row = rows.get(key)
        if (!row) {
          row = document.createElement('li')
          row.dataset.glideKey = key
          Object.defineProperty(row, 'offsetTop', { get: () => { reads.count++; return tops[key] } })
          row.animate = animate
          rows.set(key, row)
        }
        return row
      }))
    }
    return { ref: { current: el }, reads, animate, order }
  }

  it('glides a row that moved, adding to any motion of its own (its arrival keeps playing)', () => {
    mockReducedMotion(false)
    const tops: Record<string, number> = { a: 0, b: 40 }
    const l = list(tops)
    l.order(['a', 'b'])
    const { rerender } = renderHook(({ keys }) => useListGlide(l.ref, keys), { initialProps: { keys: ['a', 'b'] } })
    expect(l.animate).not.toHaveBeenCalled()
    // A new row on top: the others move down by its height.
    tops.c = 0; tops.a = 40; tops.b = 80
    l.order(['c', 'a', 'b'])
    rerender({ keys: ['c', 'a', 'b'] })
    expect(l.animate).toHaveBeenCalledTimes(2)
    expect(l.animate).toHaveBeenCalledWith(
      [{ transform: 'translateY(-40px)' }, { transform: 'translateY(0px)' }],
      expect.objectContaining({ composite: 'add' }),
    )
  })

  it('reads the rows\' places only when their order changes, not on every render', () => {
    mockReducedMotion(false)
    const l = list({ a: 0, b: 40 })
    l.order(['a', 'b'])
    const { rerender } = renderHook(({ keys }) => useListGlide(l.ref, keys), { initialProps: { keys: ['a', 'b'] } })
    const reads = l.reads.count
    rerender({ keys: ['a', 'b'] })
    rerender({ keys: ['a', 'b'] })
    expect(l.reads.count).toBe(reads)
  })

  it('glides nothing under reduced motion', () => {
    mockReducedMotion(true)
    const tops: Record<string, number> = { a: 0, b: 40 }
    const l = list(tops)
    l.order(['a', 'b'])
    const { rerender } = renderHook(({ keys }) => useListGlide(l.ref, keys), { initialProps: { keys: ['a', 'b'] } })
    tops.a = 40; tops.b = 0
    l.order(['b', 'a'])
    rerender({ keys: ['b', 'a'] })
    expect(l.animate).not.toHaveBeenCalled()
  })
})

describe('useWidthGlide', () => {
  afterEach(() => vi.unstubAllGlobals())

  /**
   * A button in a row: its laid-out width and its parent's room are set by
   * the test, with a ResizeObserver it fires by hand and an `animate` whose
   * glides it finishes.
   */
  function row(width: number, room: number) {
    const parent = document.createElement('div')
    const el = document.createElement('button')
    parent.append(el)
    const size = { width, room }
    el.getBoundingClientRect = () => ({ width: size.width }) as DOMRect
    parent.getBoundingClientRect = () => ({ width: size.room }) as DOMRect
    const glides: { keyframes: Keyframe[]; finish: () => void }[] = []
    el.animate = ((keyframes: Keyframe[]) => {
      let finish!: () => void
      const finished = new Promise<void>((resolve) => { finish = resolve })
      glides.push({ keyframes, finish })
      return { finished, cancel: () => {} } as unknown as Animation
    }) as typeof el.animate
    let notify: (entries: { target: Element }[]) => void = () => {}
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: typeof notify) { notify = cb }
      observe() {}
      disconnect() {}
    })
    const resize = (next: Partial<typeof size>, targets: Element[]) => {
      Object.assign(size, next)
      notify(targets.map((target) => ({ target })))
    }
    return { ref: { current: el }, el, parent, glides, resize }
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('glides out to a wider room, and takes a narrower one at once', async () => {
    mockReducedMotion(false)
    const r = row(100, 120)
    renderHook(() => useWidthGlide(r.ref))
    r.resize({ width: 200, room: 220 }, [r.parent, r.el])
    expect(r.glides.map((g) => g.keyframes)).toEqual([[{ width: '100px' }, { width: '200px' }]])
    r.glides[0].finish()
    await settle()
    r.resize({ width: 90, room: 110 }, [r.parent, r.el])
    expect(r.glides).toHaveLength(1)
  })

  it('starts its next glide from the width it landed on, even if its label changed mid-glide', async () => {
    mockReducedMotion(false)
    const r = row(100, 120)
    renderHook(() => useWidthGlide(r.ref))
    r.resize({ width: 200, room: 220 }, [r.parent, r.el])
    // Mid-glide its label gets shorter: its own notice only.
    r.resize({ width: 180 }, [r.el])
    r.glides[0].finish()
    await settle()
    r.resize({ width: 250, room: 270 }, [r.parent, r.el])
    expect(r.glides[1].keyframes).toEqual([{ width: '180px' }, { width: '250px' }])
  })

  it('glides nothing under reduced motion', () => {
    mockReducedMotion(true)
    const r = row(100, 120)
    renderHook(() => useWidthGlide(r.ref))
    r.resize({ width: 200, room: 220 }, [r.parent, r.el])
    expect(r.glides).toEqual([])
  })
})
